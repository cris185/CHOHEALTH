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
from billing.models import Invoice, InvoiceLineItem
from .medical_serializers import (
    MedicationSerializer, MedicationCatalogSerializer, LabTestSerializer,
    MedicalRecordCreateSerializer, PrescriptionCreateSerializer,
    LabOrderCreateSerializer, AppointmentStatusUpdateSerializer,
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
            context={'current_status': appointment.status},
        )
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data['status']
        appointment.status = new_status
        appointment.save(update_fields=['status'])

        # Notify patient
        _notify(
            appointment.patient.user,
            f'Appointment {new_status}',
            f'Appointment {new_status}',
            f'Your appointment has been marked as {new_status}.',
            appointment,
        )

        return Response({'detail': f'Appointment status updated to {new_status}.', 'status': new_status})


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
    """List lab test catalog."""
    serializer_class = LabTestSerializer
    permission_classes = [IsDoctor]
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']

    def get_queryset(self):
        return LabTest.objects.filter(is_active=True)


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

        # Create free appointment
        appointment = Appointment.objects.create(
            patient=request.user.patient,
            doctor=None,
            service=None,
            date=date,
            status='Scheduled',
            mode='In-Person',
            branch=branch,
            lab_order=lab_order,
            notes=f'Lab appointment for order {lab_order.sid}',
        )

        # Create zero-cost invoice
        invoice = Invoice.objects.create(
            appointment=appointment,
            patient=request.user.patient,
            subtotal=Decimal('0'),
            total=Decimal('0'),
            amount_paid=Decimal('0'),
            balance_due=Decimal('0'),
            status='Paid',
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
    """Create a medicine order (patient purchases medications)."""
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request):
        serializer = MedicineOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        patient = request.user.patient
        data = serializer.validated_data

        # Resolve branch
        branch = None
        if data['delivery_method'] == 'pickup' and data.get('branch_sid'):
            try:
                branch = Branch.objects.get(sid=data['branch_sid'], is_active=True)
            except Branch.DoesNotExist:
                return Response({'detail': 'Branch not found.'}, status=status.HTTP_400_BAD_REQUEST)

        # Create order
        order = MedicineOrder.objects.create(
            patient=patient,
            delivery_method=data['delivery_method'],
            delivery_branch=branch,
            delivery_address=data.get('delivery_address', ''),
            notes=data.get('notes', ''),
            status='Pending Payment',
        )

        # Create items and calculate total
        subtotal = Decimal('0')
        for item_data in data['items']:
            medication = Medication.objects.get(sid=item_data['medication_sid'])
            quantity = item_data.get('quantity', 1)
            item_total = medication.cost * quantity

            MedicineOrderItem.objects.create(
                order=order,
                medication=medication,
                quantity=quantity,
                unit_price=medication.cost,
                total=item_total,
            )
            subtotal += item_total

        order.subtotal = subtotal
        order.total = subtotal
        order.save()

        return Response({
            'order_sid': order.sid,
            'total': str(order.total),
            'detail': 'Medicine order created. Proceed to payment.',
        }, status=status.HTTP_201_CREATED)


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
