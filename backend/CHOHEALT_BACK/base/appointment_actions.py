"""
Patient and doctor actions on existing appointments: cancel and reschedule.

Policies (from product spec):
- Patient cancel of a PAID appointment:
    > 48h before  →  100% refund
    24-48h before →  50% refund
    < 24h before  →  0% refund
- Patient cancel of an UNPAID appointment: delegated to existing CancelPendingPaymentView.
- Patient reschedule: free, only must land on a slot the doctor has available.
- Doctor cancel: always 100% refund.
- Doctor reschedule: free, only must land on a slot the doctor has available.

Refund gateway calls + Refund model + Invoice status are handled by
`billing.refund_service.process_refund`.
"""

from datetime import timedelta
import zoneinfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from patient.permissions import IsPatient
from doctor.permissions import IsDoctor
from doctor.models import Notification, DoctorSchedule

from .models import Appointment
from billing.models import Invoice
from billing.refund_service import process_refund, calculate_refund_amount
from userauths.services.email_service import (
    send_appointment_cancellation_email,
    send_appointment_rescheduled_email,
)


# ============================================================================
# Helpers
# ============================================================================

def _notify(recipient_user, notif_type, title, message, appointment=None):
    Notification.objects.create(
        recipient=recipient_user,
        type=notif_type,
        title=title,
        message=message,
        appointment=appointment,
    )


def _validate_new_slot(doctor, service, new_date, exclude_appointment):
    """
    Validate that `new_date` falls on a slot this doctor has available:
      - within a DoctorSchedule block for that weekday
      - not during a break
      - not overlapping with another blocking appointment (excluding `exclude_appointment`)
      - must be in the future

    Returns (ok, error_message).
    """
    if new_date <= timezone.now():
        return False, 'New appointment date must be in the future.'

    if not doctor or not service:
        # Lab/service without doctor — no schedule check needed
        return True, ''

    tz = zoneinfo.ZoneInfo(settings.TIME_ZONE)
    local_date = new_date.astimezone(tz)
    day_of_week = local_date.weekday()
    appt_time = local_date.time()

    schedule = DoctorSchedule.objects.filter(
        doctor=doctor, day_of_week=day_of_week, is_active=True,
        start_time__lte=appt_time, end_time__gt=appt_time,
    ).first()

    if not schedule:
        return False, 'Doctor is not available at this time.'

    duration = timedelta(minutes=service.duration_minutes)
    slot_end = new_date + duration

    # Break check
    if schedule.break_start and schedule.break_end:
        from datetime import datetime
        slot_end_local_time = (datetime.combine(local_date.date(), appt_time) + duration).time()
        if appt_time < schedule.break_end and slot_end_local_time > schedule.break_start:
            return False, 'This time slot falls within the doctor\'s break period.'

    # Schedule end check — slot must fit entirely within the block
    from datetime import datetime as _dt
    schedule_end_dt = _dt.combine(local_date.date(), schedule.end_time).replace(tzinfo=tz)
    if slot_end > schedule_end_dt:
        return False, 'This time slot extends beyond the doctor\'s working hours.'

    # Overlap check — other blocking appointments. Unpaid is NOT blocking.
    conflicts = Appointment.objects.filter(
        doctor=doctor,
        status__in=['Confirmed', 'In Progress'],
    ).exclude(pk=exclude_appointment.pk).select_related('service')

    for appt in conflicts:
        appt_duration = appt.service.duration_minutes if appt.service else 30
        existing_end = appt.date + timedelta(minutes=appt_duration)
        if new_date < existing_end and slot_end > appt.date:
            return False, 'This time slot is already booked.'

    return True, ''


def _get_latest_completed_payment(invoice):
    """Returns the most recent Completed Payment on an Invoice, or None."""
    return invoice.payments.filter(status='Completed').order_by('-paid_at').first()


# ============================================================================
# Patient: Cancel
# ============================================================================

class PatientAppointmentDeleteView(APIView):
    """
    Patient hard-deletes an Unpaid appointment.
    Only works for status='Unpaid'. By invariant, Unpaid appointments NEVER have
    an Invoice (invoices are only created on successful payment), so this is a
    clean hard delete with nothing to cascade.
    """
    permission_classes = [IsPatient]

    @transaction.atomic
    def delete(self, request, sid):
        try:
            appointment = Appointment.objects.get(sid=sid, patient=request.user.patient)
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appointment.status != 'Unpaid':
            return Response(
                {'detail': f'Only unpaid appointments can be deleted. Use cancel for "{appointment.status}" appointments.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        appointment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PatientAppointmentCancelView(APIView):
    """
    Patient cancels a BOOKED appointment (Scheduled or Confirmed).
    - Paid (Confirmed): tiered refund policy (100%/50%/0%).
    - Scheduled (unpaid reservation, e.g. admin-created or free lab): soft cancel.

    For status='Unpaid', use `PatientAppointmentDeleteView` instead.
    """
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request, sid):
        try:
            appointment = Appointment.objects.select_related('patient', 'doctor', 'service').get(
                sid=sid, patient=request.user.patient,
            )
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appointment.status == 'Unpaid':
            return Response(
                {'detail': 'Use delete for unpaid appointments.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if appointment.status in ('Cancelled', 'Completed', 'No Show'):
            return Response({'detail': f'Cannot cancel an appointment in "{appointment.status}" state.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            invoice = appointment.invoice
        except Invoice.DoesNotExist:
            invoice = None

        reason = request.data.get('reason', '').strip()

        # Unpaid path — no refund, just mark cancelled and void invoice
        if not invoice or invoice.status != 'Paid':
            appointment.status = 'Cancelled'
            appointment.cancelled_at = timezone.now()
            appointment.cancelled_by = 'patient'
            appointment.cancel_reason = reason
            appointment.save(update_fields=['status', 'cancelled_at', 'cancelled_by', 'cancel_reason'])

            if invoice and invoice.status != 'Void':
                invoice.status = 'Void'
                invoice.save(update_fields=['status', 'updated_at'])

            send_appointment_cancellation_email(appointment, cancelled_by='patient', refund_amount=None)
            return Response({'detail': 'Appointment cancelled.', 'refund_amount': '0.00'})

        # Paid path — calculate refund, process gateway, then mark cancelled
        payment = _get_latest_completed_payment(invoice)
        if not payment:
            return Response({'detail': 'No completed payment found on this invoice.'}, status=status.HTTP_400_BAD_REQUEST)

        refund_amount = calculate_refund_amount(payment, appointment.date)

        refund_obj = None
        if refund_amount > 0:
            try:
                refund_obj = process_refund(
                    payment=payment,
                    amount=refund_amount,
                    reason='appointment_cancelled',
                    reason_detail=reason or 'Cancelled by patient',
                    processed_by=request.user,
                )
            except ValueError as e:
                return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

            if refund_obj.status != 'Completed':
                gateway_error = (refund_obj.gateway_response or {}).get('error') or 'Refund was rejected by the payment gateway.'
                return Response({'detail': f'Refund failed: {gateway_error}'}, status=status.HTTP_502_BAD_GATEWAY)

        appointment.status = 'Cancelled'
        appointment.cancelled_at = timezone.now()
        appointment.cancelled_by = 'patient'
        appointment.cancel_reason = reason
        appointment.save(update_fields=['status', 'cancelled_at', 'cancelled_by', 'cancel_reason'])

        # Notify doctor
        if appointment.doctor:
            _notify(
                appointment.doctor.user,
                'Appointment Cancelled',
                'Appointment Cancelled',
                f'{appointment.patient.full_name} cancelled their appointment on {appointment.date.strftime("%b %d, %Y at %I:%M %p")}.',
                appointment,
            )

        # Email patient
        send_appointment_cancellation_email(appointment, cancelled_by='patient', refund_amount=refund_amount)

        return Response({
            'detail': 'Appointment cancelled.',
            'refund_amount': f'{refund_amount:.2f}',
            'refund_status': refund_obj.status if refund_obj else 'No refund (within 24h policy)',
        })


# ============================================================================
# Patient: Reschedule
# ============================================================================

class PatientAppointmentRescheduleView(APIView):
    """Patient picks a new date/time for an existing appointment."""
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request, sid):
        new_date_str = request.data.get('date')
        if not new_date_str:
            return Response({'detail': 'date is required.'}, status=status.HTTP_400_BAD_REQUEST)

        new_date = parse_datetime(new_date_str)
        if not new_date:
            return Response({'detail': 'Invalid date format.'}, status=status.HTTP_400_BAD_REQUEST)
        if timezone.is_naive(new_date):
            new_date = timezone.make_aware(new_date)

        try:
            appointment = Appointment.objects.select_related('patient', 'doctor', 'service').get(
                sid=sid, patient=request.user.patient,
            )
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appointment.status not in ('Unpaid', 'Confirmed'):
            return Response({'detail': f'Cannot reschedule an appointment in "{appointment.status}" state.'}, status=status.HTTP_400_BAD_REQUEST)

        ok, error = _validate_new_slot(
            doctor=appointment.doctor,
            service=appointment.service,
            new_date=new_date,
            exclude_appointment=appointment,
        )
        if not ok:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        old_date = appointment.date
        appointment.rescheduled_from = old_date
        appointment.date = new_date
        appointment.reschedule_count = (appointment.reschedule_count or 0) + 1
        appointment.save(update_fields=['date', 'rescheduled_from', 'reschedule_count'])

        # Notify doctor (only for Confirmed — Unpaid reschedules are silent)
        if appointment.doctor and appointment.status == 'Confirmed':
            _notify(
                appointment.doctor.user,
                'Appointment Rescheduled',
                'Appointment Rescheduled',
                f'{appointment.patient.full_name} rescheduled their appointment to {new_date.strftime("%b %d, %Y at %I:%M %p")}.',
                appointment,
            )

        send_appointment_rescheduled_email(appointment, old_date=old_date, rescheduled_by='patient')

        return Response({
            'detail': 'Appointment rescheduled.',
            'new_date': new_date.isoformat(),
            'reschedule_count': appointment.reschedule_count,
        })


# ============================================================================
# Doctor: Cancel (full refund)
# ============================================================================

class DoctorAppointmentCancelView(APIView):
    """Doctor cancels an appointment. Always 100% refund."""
    permission_classes = [IsDoctor]

    @transaction.atomic
    def post(self, request, sid):
        try:
            appointment = Appointment.objects.select_related('patient', 'doctor', 'service').get(
                sid=sid, doctor=request.user.doctor,
            )
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appointment.status in ('Cancelled', 'Completed', 'No Show'):
            return Response({'detail': f'Cannot cancel an appointment in "{appointment.status}" state.'}, status=status.HTTP_400_BAD_REQUEST)

        reason = request.data.get('reason', '').strip()

        try:
            invoice = appointment.invoice
        except Invoice.DoesNotExist:
            invoice = None

        refund_amount = None

        if invoice and invoice.status == 'Paid':
            payment = _get_latest_completed_payment(invoice)
            if payment:
                # Full refund — ignore tiered policy
                # Use remaining refundable balance (payment.amount minus already refunded)
                already_refunded = sum(r.amount for r in payment.refunds.filter(status='Completed'))
                remaining = payment.amount - already_refunded
                if remaining > 0:
                    try:
                        refund_obj = process_refund(
                            payment=payment,
                            amount=remaining,
                            reason='appointment_cancelled',
                            reason_detail=reason or 'Cancelled by doctor',
                            processed_by=request.user,
                        )
                    except ValueError as e:
                        return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

                    if refund_obj.status != 'Completed':
                        gateway_error = (refund_obj.gateway_response or {}).get('error') or 'Refund was rejected by the payment gateway.'
                        return Response({'detail': f'Refund failed: {gateway_error}'}, status=status.HTTP_502_BAD_GATEWAY)
                    refund_amount = remaining
        elif invoice and invoice.status != 'Void':
            invoice.status = 'Void'
            invoice.save(update_fields=['status', 'updated_at'])

        appointment.status = 'Cancelled'
        appointment.cancelled_at = timezone.now()
        appointment.cancelled_by = 'doctor'
        appointment.cancel_reason = reason
        appointment.save(update_fields=['status', 'cancelled_at', 'cancelled_by', 'cancel_reason'])

        # Notify patient in-app
        _notify(
            appointment.patient.user,
            'Appointment Cancelled',
            'Appointment Cancelled by Doctor',
            f'Your appointment on {appointment.date.strftime("%b %d, %Y at %I:%M %p")} was cancelled by the doctor. A full refund has been issued.' if refund_amount else f'Your appointment on {appointment.date.strftime("%b %d, %Y at %I:%M %p")} was cancelled by the doctor.',
            appointment,
        )

        # Email patient
        send_appointment_cancellation_email(appointment, cancelled_by='doctor', refund_amount=refund_amount)

        return Response({
            'detail': 'Appointment cancelled.',
            'refund_amount': f'{refund_amount:.2f}' if refund_amount is not None else '0.00',
        })


# ============================================================================
# Doctor: Reschedule
# ============================================================================

class DoctorAppointmentRescheduleView(APIView):
    """Doctor changes the date/time of an appointment. Payment stays attached."""
    permission_classes = [IsDoctor]

    @transaction.atomic
    def post(self, request, sid):
        new_date_str = request.data.get('date')
        if not new_date_str:
            return Response({'detail': 'date is required.'}, status=status.HTTP_400_BAD_REQUEST)

        new_date = parse_datetime(new_date_str)
        if not new_date:
            return Response({'detail': 'Invalid date format.'}, status=status.HTTP_400_BAD_REQUEST)
        if timezone.is_naive(new_date):
            new_date = timezone.make_aware(new_date)

        try:
            appointment = Appointment.objects.select_related('patient', 'doctor', 'service').get(
                sid=sid, doctor=request.user.doctor,
            )
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appointment.status != 'Confirmed':
            return Response({'detail': f'Cannot reschedule an appointment in "{appointment.status}" state.'}, status=status.HTTP_400_BAD_REQUEST)

        ok, error = _validate_new_slot(
            doctor=appointment.doctor,
            service=appointment.service,
            new_date=new_date,
            exclude_appointment=appointment,
        )
        if not ok:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        old_date = appointment.date
        appointment.rescheduled_from = old_date
        appointment.date = new_date
        appointment.reschedule_count = (appointment.reschedule_count or 0) + 1
        appointment.save(update_fields=['date', 'rescheduled_from', 'reschedule_count'])

        # Notify patient in-app
        _notify(
            appointment.patient.user,
            'Appointment Rescheduled',
            'Appointment Rescheduled by Doctor',
            f'Dr. {appointment.doctor.first_name} {appointment.doctor.first_last_name} changed your appointment from {old_date.strftime("%b %d, %Y at %I:%M %p")} to {new_date.strftime("%b %d, %Y at %I:%M %p")}.',
            appointment,
        )

        send_appointment_rescheduled_email(appointment, old_date=old_date, rescheduled_by='doctor')

        return Response({
            'detail': 'Appointment rescheduled.',
            'new_date': new_date.isoformat(),
            'reschedule_count': appointment.reschedule_count,
        })
