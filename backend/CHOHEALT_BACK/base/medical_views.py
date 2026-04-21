from decimal import Decimal
from rest_framework import generics, status, filters
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import transaction
from django.utils import timezone

from rest_framework.permissions import AllowAny

from doctor.permissions import IsDoctor
from patient.permissions import IsPatient
from doctor.models import Notification
from .models import (
    Appointment, MedicalRecord, Medication,
    Prescription, PrescriptionItem, Branch,
    LabTest, LabOrder, LabOrderItem,
    MedicineOrder, MedicineOrderItem,
)
from .pickup_code import generate_unique_pickup_code, generate_qr_png_bytes
from billing.models import Invoice, InvoiceLineItem
from userauths.services.email_service import send_medicine_order_pickup_email
from .medical_serializers import (
    MedicationSerializer, MedicationCatalogSerializer, LabTestSerializer,
    LabTestDetailSerializer,
    MedicalRecordCreateSerializer, PrescriptionCreateSerializer,
    LabOrderCreateSerializer, AppointmentStatusUpdateSerializer,
    AppointmentCompleteSerializer,
    MedicalRecordListSerializer, MedicalRecordDetailSerializer,
    PrescriptionDetailSerializer, LabOrderDetailSerializer,
    LabResultDetailSerializer, DeliveryRequestSerializer,
    MedicineOrderCreateSerializer, MedicineOrderListSerializer, MedicineOrderDetailSerializer,
)


def _notify(recipient_user, notif_type, title, message, appointment=None):
    """Helper to create notification."""
    Notification.objects.create(
        recipient=recipient_user,
        type=notif_type,
        title=title,
        message=message,
        appointment=appointment,
    )


# ============================================================================
# Doctor Endpoints
# ============================================================================

class DoctorAppointmentStatusUpdateView(APIView):
    """Change appointment status (Confirmed, In Progress, Completed, etc.)."""
    permission_classes = [IsDoctor]

    def patch(self, request, sid):
        try:
            appointment = Appointment.objects.get(sid=sid, doctor=request.user.doctor)
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = AppointmentStatusUpdateSerializer(
            data=request.data,
            context={
                'current_status': appointment.status,
                'mode': appointment.mode,
            },
        )
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data['status']
        update_fields = ['status']
        appointment.status = new_status

        # Stash the meeting link on the appointment the moment the doctor
        # starts a virtual consultation, then email the patient so they can
        # click through and join without going back to the app.
        is_virtual_start = (
            new_status == 'In Progress'
            and appointment.mode == 'Virtual'
            and serializer.validated_data.get('meeting_link')
        )
        if is_virtual_start:
            appointment.meeting_link = serializer.validated_data['meeting_link']
            appointment.meeting_provider = serializer.validated_data.get('meeting_provider', '')
            update_fields.extend(['meeting_link', 'meeting_provider'])

        appointment.save(update_fields=update_fields)

        if is_virtual_start:
            _notify(
                appointment.patient.user,
                'Virtual consultation started',
                'Your virtual consultation is ready',
                f'Dr. {appointment.doctor.first_name} {appointment.doctor.first_last_name} is waiting for you. Tap to join the meeting.',
                appointment,
            )
            try:
                from userauths.services.email_service import send_virtual_appointment_started_email
                send_virtual_appointment_started_email(appointment)
            except Exception:
                # Fire-and-forget: the meeting link is already persisted, the
                # patient can still find it in the in-app notification.
                pass
        else:
            _notify(
                appointment.patient.user,
                f'Appointment {new_status}',
                f'Appointment {new_status}',
                f'Your appointment has been marked as {new_status}.',
                appointment,
            )

        return Response({
            'detail': f'Appointment status updated to {new_status}.',
            'status': new_status,
            'meeting_link': appointment.meeting_link,
        })


class DoctorAppointmentCompleteView(APIView):
    """Atomically close an appointment: transition to Completed, create the
    medical record, and optionally create a prescription and/or a lab order,
    all in a single transaction.

    Rules:
      - The current status must be `Confirmed` or `In Progress`.
      - `diagnosis` is required; `treatment_plan` and `notes` are optional.
      - `prescription` and `lab_order` blocks are optional; if omitted or with
        an empty `items` list, the associated rows are NOT created.
      - Once the medical record / prescription / lab order are created, they
        are immutable via this endpoint (no upsert). A retry on the same
        appointment fails with 400 `already completed`.
    """
    permission_classes = [IsDoctor]

    @transaction.atomic
    def post(self, request, sid):
        try:
            appointment = Appointment.objects.get(sid=sid, doctor=request.user.doctor)
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appointment.status not in ('Confirmed', 'In Progress'):
            return Response(
                {'detail': f'Cannot complete appointment in status "{appointment.status}".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if hasattr(appointment, 'medical_record'):
            return Response(
                {'detail': 'Appointment already has a medical record.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AppointmentCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # 1. Close the appointment
        appointment.status = 'Completed'
        appointment.save(update_fields=['status'])

        # 2. Create the medical record
        record = MedicalRecord.objects.create(
            appointment=appointment,
            doctor=request.user.doctor,
            patient=appointment.patient,
            diagnosis=data['diagnosis'],
            treatment_plan=data.get('treatment_plan', ''),
            notes=data.get('notes', ''),
        )

        # 3. Create the prescription only if items were provided
        prescription_sid = None
        prescription_block = data.get('prescription') or {}
        prescription_items = prescription_block.get('items') or []
        if prescription_items:
            prescription = Prescription.objects.create(
                medical_record=record,
                additional_notes=prescription_block.get('additional_notes', ''),
            )
            for item_data in prescription_items:
                medication = item_data.get('_medication')
                PrescriptionItem.objects.create(
                    prescription=prescription,
                    medication=medication,
                    medication_name=(
                        item_data.get('medication_name') or (str(medication) if medication else '')
                    ),
                    dosage=item_data['dosage'],
                    frequency=item_data['frequency'],
                    duration_days=item_data['duration_days'],
                    instructions=item_data.get('instructions', ''),
                    delivery_method='external',
                )
            prescription_sid = prescription.sid

        # 4. Create the lab order only if items were provided
        lab_order_sid = None
        lab_order_block = data.get('lab_order') or {}
        lab_order_items = lab_order_block.get('items') or []
        if lab_order_items:
            lab_order = LabOrder.objects.create(
                medical_record=record,
                notes=lab_order_block.get('notes', ''),
                is_prescribed=True,
                source_appointment=appointment,
            )
            for item_data in lab_order_items:
                test = LabTest.objects.get(sid=item_data['test_sid'])
                LabOrderItem.objects.create(
                    lab_order=lab_order,
                    test=test,
                    notes=item_data.get('notes', ''),
                )
            lab_order_sid = lab_order.sid

        # 5. Notify the patient with a single, coherent message
        has_rx = prescription_sid is not None
        has_lab = lab_order_sid is not None
        if has_rx and has_lab:
            title = 'Visit Complete — Prescription & Lab Order Ready'
            message = (
                f'Your visit with Dr. {request.user.doctor.first_name} '
                f'{request.user.doctor.first_last_name} is complete. A prescription '
                f'and a lab order are now available in your dashboard.'
            )
        elif has_rx:
            title = 'Visit Complete — Prescription Ready'
            message = (
                f'Your visit with Dr. {request.user.doctor.first_name} '
                f'{request.user.doctor.first_last_name} is complete. A prescription '
                f'is now available in your dashboard.'
            )
        elif has_lab:
            title = 'Visit Complete — Lab Order Ready'
            message = (
                f'Your visit with Dr. {request.user.doctor.first_name} '
                f'{request.user.doctor.first_last_name} is complete. A lab order '
                f'is now available in your dashboard.'
            )
        else:
            title = 'Visit Complete'
            message = (
                f'Your visit with Dr. {request.user.doctor.first_name} '
                f'{request.user.doctor.first_last_name} is complete. Your medical '
                f'record is now available in your dashboard.'
            )
        _notify(appointment.patient.user, title, title, message, appointment)

        # Invite the patient to rate the doctor. Only for consultations —
        # lab-staff ratings will land in a later phase.
        if appointment.service_id and not appointment.lab_test_id:
            _notify(
                appointment.patient.user,
                'Rate Doctor',
                'How was your visit?',
                (
                    f'Share your experience with Dr. {request.user.doctor.first_name} '
                    f'{request.user.doctor.first_last_name}. Your feedback helps other patients.'
                ),
                appointment,
            )

        return Response(
            {
                'detail': 'Appointment completed.',
                'appointment_sid': appointment.sid,
                'medical_record_sid': record.sid,
                'prescription_sid': prescription_sid,
                'lab_order_sid': lab_order_sid,
            },
            status=status.HTTP_201_CREATED,
        )


class MedicalRecordCreateView(APIView):
    """Create medical record for a completed appointment."""
    permission_classes = [IsDoctor]

    @transaction.atomic
    def post(self, request, sid):
        try:
            appointment = Appointment.objects.get(sid=sid, doctor=request.user.doctor)
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appointment.status != 'Completed':
            return Response({'detail': 'Appointment must be Completed to create a medical record.'}, status=status.HTTP_400_BAD_REQUEST)

        if hasattr(appointment, 'medical_record'):
            return Response({'detail': 'Medical record already exists for this appointment.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = MedicalRecordCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        record = MedicalRecord.objects.create(
            appointment=appointment,
            doctor=request.user.doctor,
            patient=appointment.patient,
            diagnosis=serializer.validated_data['diagnosis'],
            treatment_plan=serializer.validated_data.get('treatment_plan', ''),
            notes=serializer.validated_data.get('notes', ''),
        )

        _notify(
            appointment.patient.user,
            'Medical Record Available',
            'Medical Record Available',
            f'Your medical record for the appointment on {appointment.date.strftime("%b %d, %Y")} is now available.',
            appointment,
        )

        return Response({'sid': record.sid, 'detail': 'Medical record created.'}, status=status.HTTP_201_CREATED)


class PrescriptionCreateView(APIView):
    """Create prescription with items for a medical record."""
    permission_classes = [IsDoctor]

    @transaction.atomic
    def post(self, request, sid):
        try:
            record = MedicalRecord.objects.get(sid=sid, doctor=request.user.doctor)
        except MedicalRecord.DoesNotExist:
            return Response({'detail': 'Medical record not found.'}, status=status.HTTP_404_NOT_FOUND)

        if hasattr(record, 'prescription'):
            return Response({'detail': 'Prescription already exists for this medical record.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = PrescriptionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        prescription = Prescription.objects.create(
            medical_record=record,
            additional_notes=serializer.validated_data.get('additional_notes', ''),
        )

        for item_data in serializer.validated_data['items']:
            medication = item_data.get('_medication')
            PrescriptionItem.objects.create(
                prescription=prescription,
                medication=medication,
                medication_name=item_data.get('medication_name') or str(medication) if medication else item_data['medication_name'],
                dosage=item_data['dosage'],
                frequency=item_data['frequency'],
                duration_days=item_data['duration_days'],
                instructions=item_data.get('instructions', ''),
                delivery_method='external',
            )

        _notify(
            record.patient.user,
            'Prescription Ready',
            'New Prescription Available',
            f'Dr. {record.doctor.first_name} {record.doctor.first_last_name} has created a prescription for you.',
            record.appointment,
        )

        return Response({'sid': prescription.sid, 'detail': 'Prescription created.'}, status=status.HTTP_201_CREATED)


class LabOrderCreateView(APIView):
    """Create lab order with items for a medical record."""
    permission_classes = [IsDoctor]

    @transaction.atomic
    def post(self, request, sid):
        try:
            record = MedicalRecord.objects.get(sid=sid, doctor=request.user.doctor)
        except MedicalRecord.DoesNotExist:
            return Response({'detail': 'Medical record not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = LabOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        lab_order = LabOrder.objects.create(
            medical_record=record,
            notes=serializer.validated_data.get('notes', ''),
            is_prescribed=True,
            source_appointment=record.appointment,
        )

        for item_data in serializer.validated_data['items']:
            test = LabTest.objects.get(sid=item_data['test_sid'])
            LabOrderItem.objects.create(
                lab_order=lab_order,
                test=test,
                notes=item_data.get('notes', ''),
            )

        _notify(
            record.patient.user,
            'Lab Order Created',
            'New Lab Order',
            f'Dr. {record.doctor.first_name} {record.doctor.first_last_name} has ordered lab tests for you. Please book a lab appointment.',
            record.appointment,
        )

        return Response({'sid': lab_order.sid, 'detail': 'Lab order created.'}, status=status.HTTP_201_CREATED)


class MedicationListView(generics.ListAPIView):
    """List medication catalog for doctor autocomplete."""
    serializer_class = MedicationSerializer
    permission_classes = [IsDoctor]
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'generic_name']

    def get_queryset(self):
        return Medication.objects.filter(is_active=True)


class LabTestListView(generics.ListAPIView):
    """List lab test catalog (DOCTOR side — used by the Rx modal autocomplete)."""
    serializer_class = LabTestSerializer
    permission_classes = [IsDoctor]
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']

    def get_queryset(self):
        return LabTest.objects.filter(is_active=True)


class LabTestCatalogView(generics.ListAPIView):
    """Public catalog of lab tests (PATIENT side).

    Returns every active lab test. Patients can book directly the ones with
    `requires_prescription=False`; the ones with `requires_prescription=True`
    need a doctor's prescription first.

    When the request is authenticated AND the user is a Patient, each lab is
    annotated with `has_active_prescription: bool` so the UI can render a
    "Free for you" badge for labs the patient already has prescribed and
    unclaimed. Anonymous requests get `has_active_prescription=false` for
    every item — that's fine, the badge just won't render.
    """
    serializer_class = LabTestSerializer
    permission_classes = [AllowAny]
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'category']

    def get_queryset(self):
        return LabTest.objects.filter(is_active=True)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # Compute the set of LabTest sids the patient has an active (unclaimed)
        # prescription for. Mirrors the logic in BookDirectLabAppointmentView.
        active_sids = set()
        user = getattr(request, 'user', None)
        if user and user.is_authenticated and getattr(user, 'user_type', None) == 'Patient':
            from .models import LabOrderItem
            patient = user.patient
            active_sids = set(
                LabOrderItem.objects
                .filter(
                    lab_order__medical_record__patient=patient,
                    is_claimed=False,
                )
                .values_list('test__sid', flat=True)
            )
        for item in response.data:
            item['has_active_prescription'] = item['sid'] in active_sids
        return response


class LabTestDetailView(generics.RetrieveAPIView):
    """Full detail of a lab test including the staff list. Used by the patient
    booking page to show staff to pick from — mirrors `ServiceDetailView`."""
    serializer_class = LabTestDetailSerializer
    permission_classes = [AllowAny]
    lookup_field = 'sid'

    def get_queryset(self):
        return LabTest.objects.filter(is_active=True).prefetch_related('staff')


class BookDirectLabAppointmentView(APIView):
    """Book a direct lab appointment for a `LabTest` (patient-initiated).

    Business rules:
      - If the lab `requires_prescription=True`, the patient MUST have an
        unclaimed `LabOrderItem` for this test. If not → 403.
      - If the patient HAS an unclaimed LabOrderItem for this test AND the lab
        is `free_when_prescribed=True` → total = 0 → appointment auto-Confirmed
        and invoice Paid (no payment step). The LabOrderItem IS NOT consumed
        yet at this layer; the fulfilment/pickup is what marks it done (out of
        scope for this step).
      - Otherwise → total = lab_test.cost → appointment created as Unpaid, the
        patient is redirected to Stripe/PayPal.
    """
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request):
        lab_test_sid = request.data.get('lab_test_sid')
        staff_sid = request.data.get('staff_sid')
        date = request.data.get('date')
        branch_sid = request.data.get('branch_sid')

        if not lab_test_sid or not staff_sid or not date:
            return Response(
                {'detail': 'lab_test_sid, staff_sid and date are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            lab_test = LabTest.objects.get(sid=lab_test_sid, is_active=True)
        except LabTest.DoesNotExist:
            return Response({'detail': 'Lab test not found.'}, status=status.HTTP_404_NOT_FOUND)

        from doctor.models import Doctor as DoctorModel
        try:
            staff = DoctorModel.objects.get(sid=staff_sid)
        except DoctorModel.DoesNotExist:
            return Response({'detail': 'Lab staff not found.'}, status=status.HTTP_400_BAD_REQUEST)

        if not lab_test.staff.filter(pk=staff.pk).exists():
            return Response(
                {'detail': 'This staff member does not perform this lab test.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        branch = None
        if branch_sid:
            try:
                branch = Branch.objects.get(sid=branch_sid, is_active=True)
            except Branch.DoesNotExist:
                return Response({'detail': 'Branch not found.'}, status=status.HTTP_400_BAD_REQUEST)

        patient = request.user.patient

        # Check prescription coverage.
        #
        # An "active Rx" for this lab is a `LabOrderItem` belonging to the
        # patient that matches the lab and has not yet been consumed. We track
        # consumption with `LabOrderItem.is_claimed` — flipped to True once
        # the patient books the appointment that fulfils it. This keeps the
        # flow per-item: an order with 3 tests can be booked in 3 independent
        # appointments, but each individual test can only be claimed once.
        from .models import LabOrderItem  # late import to avoid cycles
        rx_item = (
            LabOrderItem.objects
            .filter(
                test=lab_test,
                lab_order__medical_record__patient=patient,
                is_claimed=False,
            )
            .order_by('lab_order__ordered_at')
            .first()
        )

        has_active_rx = rx_item is not None

        if lab_test.requires_prescription and not has_active_rx:
            return Response(
                {
                    'detail': (
                        f'"{lab_test.name}" requires a prescription. Book a '
                        f'consultation with a doctor to get one.'
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Parse the date. Slot validity against the staff's schedule is checked
        # client-side via `/doctors/<sid>/available-slots/?lab_test_sid=...` —
        # the UI only surfaces available slots. A fully defensive re-check
        # here would mirror `_validate_new_slot` for lab_tests; we trade that
        # off for simplicity at the portfolio-grade level.
        from django.utils.dateparse import parse_datetime
        date_dt = parse_datetime(date) if isinstance(date, str) else date
        if date_dt is None:
            return Response({'detail': 'Invalid date format.'}, status=status.HTTP_400_BAD_REQUEST)

        # Determine price — free if covered by an active prescription.
        if has_active_rx and lab_test.free_when_prescribed:
            total = Decimal('0')
        else:
            total = lab_test.cost

        appointment = Appointment.objects.create(
            patient=patient,
            doctor=staff,
            service=None,
            lab_test=lab_test,
            # If the Rx item existed, link its parent LabOrder so the fulfilment
            # flow can associate this appointment with the prescription.
            lab_order=rx_item.lab_order if rx_item else None,
            date=date_dt,
            status='Unpaid' if total > 0 else 'Confirmed',
            mode='In-Person',
            branch=branch,
        )

        # Free bookings invoice themselves right away (no payment step).
        # A line item is still created so the invoice / history shows WHAT was
        # booked (the lab name) instead of an empty invoice.
        if total == Decimal('0'):
            invoice = Invoice.objects.create(
                appointment=appointment,
                patient=patient,
                subtotal=Decimal('0'),
                total=Decimal('0'),
                amount_paid=Decimal('0'),
                balance_due=Decimal('0'),
                status='Paid',
                issued_at=timezone.now(),
            )
            InvoiceLineItem.objects.create(
                invoice=invoice,
                description=lab_test.name,
                quantity=1,
                unit_price=Decimal('0'),
                total=Decimal('0'),
            )

        # If the booking was covered by a prescription item, mark it claimed
        # so the patient can't book the same prescription again for free.
        # This happens for both free (total=0) and paid cases where the Rx
        # exists but `free_when_prescribed=False` — in both cases the Rx is
        # being used up, so we consume it.
        if rx_item is not None:
            rx_item.is_claimed = True
            rx_item.save(update_fields=['is_claimed'])

        return Response(
            {
                'appointment_sid': appointment.sid,
                'amount': str(total),
                'status': appointment.status,
                'lab_test_name': lab_test.name,
                'covered_by_prescription': has_active_rx and lab_test.free_when_prescribed,
            },
            status=status.HTTP_201_CREATED,
        )


# ============================================================================
# Prescribed Lab Booking (free appointment for patient)
# ============================================================================

class BookPrescribedLabAppointmentView(APIView):
    """Book a FREE lab appointment for a prescribed lab order."""
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request):
        lab_order_sid = request.data.get('lab_order_sid')
        date = request.data.get('date')
        branch_sid = request.data.get('branch_sid')

        if not lab_order_sid or not date or not branch_sid:
            return Response({'detail': 'lab_order_sid, date, and branch_sid are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            lab_order = LabOrder.objects.get(sid=lab_order_sid)
        except LabOrder.DoesNotExist:
            return Response({'detail': 'Lab order not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not lab_order.is_prescribed:
            return Response({'detail': 'This lab order is not prescribed. Use normal booking.'}, status=status.HTTP_400_BAD_REQUEST)

        if lab_order.medical_record.patient != request.user.patient:
            return Response({'detail': 'This lab order does not belong to you.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            branch = Branch.objects.get(sid=branch_sid, is_active=True)
        except Branch.DoesNotExist:
            return Response({'detail': 'Branch not found.'}, status=status.HTTP_400_BAD_REQUEST)

        # Create free appointment — already "Confirmed" since there's no payment to wait for
        appointment = Appointment.objects.create(
            patient=request.user.patient,
            doctor=None,
            service=None,
            date=date,
            status='Confirmed',
            mode='In-Person',
            branch=branch,
            lab_order=lab_order,
            notes=f'Lab appointment for order {lab_order.sid}',
        )

        # Create zero-cost invoice + one line per ordered test so the patient
        # sees what this free appointment covers in their billing history.
        invoice = Invoice.objects.create(
            appointment=appointment,
            patient=request.user.patient,
            subtotal=Decimal('0'),
            total=Decimal('0'),
            amount_paid=Decimal('0'),
            balance_due=Decimal('0'),
            status='Paid',
        )
        for idx, item in enumerate(lab_order.items.select_related('test').all()):
            InvoiceLineItem.objects.create(
                invoice=invoice,
                description=item.test.name,
                quantity=1,
                unit_price=Decimal('0'),
                total=Decimal('0'),
                lab_order_item=item,
                order=idx,
            )

        return Response({
            'appointment_sid': appointment.sid,
            'detail': 'Lab appointment booked (no charge - prescribed by doctor).',
        }, status=status.HTTP_201_CREATED)


# ============================================================================
# Delivery Management
# ============================================================================

class PrescriptionItemDeliveryStatusUpdateView(APIView):
    """Update delivery status (admin/staff/doctor)."""
    permission_classes = [IsDoctor]

    def patch(self, request, sid):
        try:
            item = PrescriptionItem.objects.get(sid=sid)
        except PrescriptionItem.DoesNotExist:
            return Response({'detail': 'Prescription item not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not item.is_system_medication:
            return Response({'detail': 'Only system medications have delivery tracking.'}, status=status.HTTP_400_BAD_REQUEST)

        new_status = request.data.get('delivery_status')
        valid_statuses = ['pending', 'ready', 'dispatched', 'delivered', 'collected']
        if new_status not in valid_statuses:
            return Response({'detail': f'Invalid status. Must be one of: {valid_statuses}'}, status=status.HTTP_400_BAD_REQUEST)

        item.delivery_status = new_status
        item.save(update_fields=['delivery_status'])

        # Notify patient
        status_titles = {
            'ready': ('Medication Ready for Pickup', 'Your medication is ready for pickup.'),
            'dispatched': ('Medication Dispatched', 'Your medication has been dispatched.'),
            'delivered': ('Medication Delivered', 'Your medication has been delivered.'),
        }
        if new_status in status_titles:
            notif_type, message = status_titles[new_status]
            patient_user = item.prescription.medical_record.patient.user
            _notify(patient_user, notif_type, notif_type, f'{item.medication_name}: {message}')

        return Response({'detail': f'Delivery status updated to {new_status}.'})


# ============================================================================
# Medicine Shop (patient purchasing medications directly)
# ============================================================================

class MedicationCatalogView(generics.ListAPIView):
    """Public catalog of medications available for purchase (no prescription required)."""
    serializer_class = MedicationCatalogSerializer
    permission_classes = [AllowAny]
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'generic_name', 'category']

    def get_queryset(self):
        qs = Medication.objects.filter(is_active=True)
        # By default show only non-prescription meds for direct purchase
        prescription_only = self.request.query_params.get('include_prescription', 'false')
        if prescription_only != 'true':
            qs = qs.filter(requires_prescription=False)
        return qs


class MedicineOrderCreateView(APIView):
    """Create a medicine order (patient purchases medications).

    Pricing & access rules per medication item:

      A) `requires_prescription == False` (over-the-counter):
         allowed, priced at `medication.cost`, no prescription link.

      B) `requires_prescription == True` with an ACTIVE prescription item
         (a PrescriptionItem issued to this patient, with the same medication,
         not yet claimed by another MedicineOrderItem):
           - If `free_when_prescribed == True` → price = 0 (covered by the
             hospital). The prescription item is atomically linked so it
             cannot be claimed twice.
           - If `free_when_prescribed == False` → price = `medication.cost`.

      C) `requires_prescription == True` WITHOUT an active prescription → 403.

    The order itself is always created in `Pending Payment` unless its total
    is zero, in which case it is created as `Paid` (nothing to charge).
    """
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request):
        serializer = MedicineOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        patient = request.user.patient
        data = serializer.validated_data

        # Resolve branch. For pickup the patient chooses one explicitly; for
        # delivery we auto-assign the first active branch as the courier's
        # pickup point (patient doesn't care which branch ships it).
        branch = None
        if data['delivery_method'] == 'pickup' and data.get('branch_sid'):
            try:
                branch = Branch.objects.get(sid=data['branch_sid'], is_active=True)
            except Branch.DoesNotExist:
                return Response({'detail': 'Branch not found.'}, status=status.HTTP_400_BAD_REQUEST)
        elif data['delivery_method'] == 'delivery':
            branch = Branch.objects.filter(is_active=True).order_by('pk').first()

        # Resolve price + optional prescription-item binding for each line
        # BEFORE creating the order, so a 403 on any single item aborts the
        # whole request without persisting anything (transaction.atomic + the
        # early Response already guarantee rollback, but this keeps side
        # effects to a minimum).
        resolved_lines = []  # list of dicts: {medication, quantity, unit_price, source_item}
        claimed_prescription_item_sids = set()  # prevent claiming the same Rx item twice within this request

        for item_data in data['items']:
            medication = Medication.objects.get(sid=item_data['medication_sid'])
            quantity = item_data.get('quantity', 1)

            if not medication.requires_prescription:
                resolved_lines.append({
                    'medication': medication,
                    'quantity': quantity,
                    'unit_price': medication.cost,
                    'source_item': None,
                })
                continue

            # Prescription-gated medication: find an unclaimed PrescriptionItem
            # belonging to this patient for this medication.
            rx_item = (
                PrescriptionItem.objects
                .filter(
                    medication=medication,
                    prescription__medical_record__patient=patient,
                    medicine_order_item__isnull=True,
                )
                .exclude(sid__in=claimed_prescription_item_sids)
                .order_by('prescription__created_at')
                .first()
            )
            if rx_item is None:
                return Response(
                    {
                        'detail': (
                            f'"{medication.name}" requires a prescription. Book an '
                            f'appointment with a doctor to get one.'
                        ),
                        'medication_sid': medication.sid,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            claimed_prescription_item_sids.add(rx_item.sid)
            unit_price = Decimal('0') if medication.free_when_prescribed else medication.cost
            resolved_lines.append({
                'medication': medication,
                'quantity': quantity,
                'unit_price': unit_price,
                'source_item': rx_item,
            })

        # Create order
        order = MedicineOrder.objects.create(
            patient=patient,
            delivery_method=data['delivery_method'],
            delivery_branch=branch,
            delivery_address=data.get('delivery_address', ''),
            notes=data.get('notes', ''),
            status='Pending Payment',
        )

        subtotal = Decimal('0')
        for line in resolved_lines:
            item_total = line['unit_price'] * line['quantity']
            MedicineOrderItem.objects.create(
                order=order,
                medication=line['medication'],
                quantity=line['quantity'],
                unit_price=line['unit_price'],
                total=item_total,
                source_prescription_item=line['source_item'],
            )
            subtotal += item_total

        order.subtotal = subtotal
        order.total = subtotal
        # Skip the payment step entirely if nothing to charge. In that case we
        # also assign a pickup code and trigger the pickup email right away —
        # the patient never goes through Stripe/PayPal for a fully-covered
        # prescription order, so this is the only opportunity to issue it.
        fully_covered = subtotal == Decimal('0')
        if fully_covered:
            order.status = 'Paid'
            order.pickup_code = generate_unique_pickup_code()
        order.save()

        if fully_covered:
            try:
                qr_bytes = generate_qr_png_bytes(order.pickup_code)
                send_medicine_order_pickup_email(order, qr_bytes)
            except Exception:
                # Non-fatal: the order is already Paid in DB, the patient can
                # still read the pickup code from the response + UI.
                pass

        return Response(
            {
                'order_sid': order.sid,
                'total': str(order.total),
                'status': order.status,
                'pickup_code': order.pickup_code,
                'detail': (
                    'Medicine order created (covered by prescription — no charge).'
                    if order.status == 'Paid'
                    else 'Medicine order created. Proceed to payment.'
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class MedicineOrderListView(generics.ListAPIView):
    """List patient's medicine orders."""
    serializer_class = MedicineOrderListSerializer
    permission_classes = [IsPatient]

    def get_queryset(self):
        return MedicineOrder.objects.filter(patient=self.request.user.patient)


class MedicineOrderDetailView(generics.RetrieveAPIView):
    """Get medicine order detail."""
    serializer_class = MedicineOrderDetailSerializer
    permission_classes = [IsPatient]
    lookup_field = 'sid'

    def get_queryset(self):
        return MedicineOrder.objects.filter(patient=self.request.user.patient).prefetch_related('items__medication')
