import stripe
import paypalrestsdk
from decimal import Decimal

from django.conf import settings
from django.utils import timezone
from django.db import transaction
from django.http import HttpResponse

from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from patient.permissions import IsPatient
from base.models import Appointment, Service, Branch, MedicineOrder
from base.pickup_code import generate_unique_pickup_code, generate_qr_png_bytes
from doctor.models import Doctor, Notification
from .stripe_customer import get_or_create_stripe_customer
from .models import Invoice, InvoiceLineItem, Payment
from userauths.services.email_service import (
    send_appointment_confirmation_email,
    send_medicine_order_pickup_email,
)

stripe.api_key = settings.STRIPE_SECRET_KEY

paypalrestsdk.configure({
    "mode": settings.PAYPAL_MODE,
    "client_id": settings.PAYPAL_CLIENT_ID,
    "client_secret": settings.PAYPAL_CLIENT_SECRET,
})

FRONTEND_URL = settings.FRONTEND_URL


def _create_appointment_notification(appointment):
    """Create notifications for doctor and patient when appointment is confirmed."""
    if appointment.doctor:
        Notification.objects.create(
            recipient=appointment.doctor.user,
            type='New Appointment',
            title='New Appointment Booked',
            message=f'New appointment booked by {appointment.patient.full_name} for {appointment.service.name if appointment.service else "service"} on {appointment.date.strftime("%b %d, %Y at %I:%M %p")}',
            appointment=appointment,
        )
    if appointment.patient:
        doctor_name = f'Dr. {appointment.doctor.first_name} {appointment.doctor.first_last_name}' if appointment.doctor else 'Lab Service'
        Notification.objects.create(
            recipient=appointment.patient.user,
            type='Appointment Confirmed',
            title='Appointment Confirmed',
            message=f'Your appointment with {doctor_name} for {appointment.service.name if appointment.service else "service"} on {appointment.date.strftime("%b %d, %Y at %I:%M %p")} has been confirmed.',
            appointment=appointment,
        )


class CreateAppointmentWithPaymentView(APIView):
    """
    Creates an appointment with status='Unpaid'. No Invoice is created — the
    Invoice is only created at the moment payment is confirmed, inside
    `_process_payment_success`. Unpaid appointments do NOT block time slots.
    """
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request):
        data = request.data
        patient = request.user.patient

        try:
            service = Service.objects.get(sid=data.get('service_sid'))
        except Service.DoesNotExist:
            return Response({'detail': 'Service not found.'}, status=status.HTTP_400_BAD_REQUEST)

        doctor = None
        if data.get('doctor_sid'):
            try:
                doctor = Doctor.objects.get(sid=data['doctor_sid'])
            except Doctor.DoesNotExist:
                return Response({'detail': 'Doctor not found.'}, status=status.HTTP_400_BAD_REQUEST)

            if not service.doctors.filter(pk=doctor.pk).exists():
                return Response({'detail': 'This doctor does not offer this service.'}, status=status.HTTP_400_BAD_REQUEST)

        if service.service_type == 'Consultation' and not doctor:
            return Response({'detail': 'Consultation services require a doctor.'}, status=status.HTTP_400_BAD_REQUEST)

        branch = None
        if data.get('mode') == 'In-Person' and data.get('branch_sid'):
            try:
                branch = Branch.objects.get(sid=data['branch_sid'], is_active=True)
            except Branch.DoesNotExist:
                pass

        appointment = Appointment.objects.create(
            patient=patient,
            doctor=doctor,
            service=service,
            date=data['date'],
            mode=data.get('mode', 'In-Person'),
            branch=branch,
            issues=data.get('issues', ''),
            symptoms=data.get('symptoms', ''),
            notes=data.get('notes', ''),
            status='Unpaid',
        )

        return Response({
            'appointment_sid': appointment.sid,
            'amount': str(service.cost),
            'service_name': service.name,
        }, status=status.HTTP_201_CREATED)


def _validate_appointment_for_payment(appointment):
    """
    Validates that an appointment is in a state where a payment can be initiated.
    Also re-checks slot availability against other confirmed bookings (defense
    against a concurrent booking that confirmed in the meantime).

    Returns (service, error_message). If error_message is not None, the caller
    should return a 400 with that message.
    """
    from base.appointment_actions import _validate_new_slot

    if appointment.status == 'Cancelled':
        return None, 'This appointment was cancelled.'
    if appointment.status == 'Confirmed':
        return None, 'Already paid.'
    if appointment.status not in ('Unpaid',):
        return None, f'Cannot pay for an appointment in "{appointment.status}" state.'

    service = appointment.service
    if not service:
        return None, 'Appointment has no service attached.'

    ok, error = _validate_new_slot(
        doctor=appointment.doctor,
        service=service,
        new_date=appointment.date,
        exclude_appointment=appointment,
    )
    if not ok:
        return None, f'This time slot is no longer available: {error}'

    return service, None


class StripeCheckoutView(APIView):
    """Creates a Stripe Checkout session. No Invoice is created here."""
    permission_classes = [IsPatient]

    def post(self, request):
        appointment_sid = request.data.get('appointment_sid')

        try:
            appointment = Appointment.objects.get(
                sid=appointment_sid,
                patient=request.user.patient,
            )
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_400_BAD_REQUEST)

        service, error = _validate_appointment_for_payment(appointment)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        try:
            customer_id = get_or_create_stripe_customer(request.user.patient)
            save_card = request.data.get('save_card', False)

            session_params = {
                'payment_method_types': ['card'],
                'line_items': [{
                    'price_data': {
                        'currency': 'usd',
                        'product_data': {
                            'name': f'Appointment: {service.name}',
                            'description': f'Dr. {appointment.doctor.first_name} {appointment.doctor.first_last_name}' if appointment.doctor else 'Lab Service',
                        },
                        'unit_amount': int(service.cost * 100),
                    },
                    'quantity': 1,
                }],
                'mode': 'payment',
                'success_url': f'{FRONTEND_URL}/dashboard/patient/booking/success?appointment={appointment.sid}&session_id={{CHECKOUT_SESSION_ID}}',
                'cancel_url': f'{FRONTEND_URL}/dashboard/patient/booking/cancel?appointment={appointment.sid}',
                'metadata': {
                    'appointment_sid': appointment.sid,
                },
            }

            if customer_id:
                session_params['customer'] = customer_id
                if save_card:
                    session_params['payment_intent_data'] = {'setup_future_usage': 'off_session'}

            checkout_session = stripe.checkout.Session.create(**session_params)

            return Response({
                'checkout_url': checkout_session.url,
                'session_id': checkout_session.id,
            })

        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StripeSavedCardPayView(APIView):
    """Pay with a saved card using PaymentIntent (no redirect). No Invoice created upfront."""
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request):
        appointment_sid = request.data.get('appointment_sid')
        payment_method_id = request.data.get('payment_method_id')

        if not appointment_sid or not payment_method_id:
            return Response({'detail': 'appointment_sid and payment_method_id required.'}, status=status.HTTP_400_BAD_REQUEST)

        patient = request.user.patient
        if not patient.stripe_customer_id:
            return Response({'detail': 'No saved payment methods.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            appointment = Appointment.objects.get(sid=appointment_sid, patient=patient)
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_400_BAD_REQUEST)

        service, error = _validate_appointment_for_payment(appointment)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payment_intent = stripe.PaymentIntent.create(
                amount=int(service.cost * 100),
                currency='usd',
                customer=patient.stripe_customer_id,
                payment_method=payment_method_id,
                off_session=True,
                confirm=True,
                metadata={
                    'appointment_sid': appointment.sid,
                },
            )

            if payment_intent.status == 'succeeded':
                _process_payment_success(
                    appointment, 'stripe',
                    payment_intent.id, {'payment_intent_id': payment_intent.id}
                )
                return Response({'detail': 'Payment successful.', 'appointment_sid': appointment.sid})
            else:
                return Response({'detail': 'Payment requires additional action.', 'client_secret': payment_intent.client_secret}, status=status.HTTP_402_PAYMENT_REQUIRED)

        except stripe.error.CardError as e:
            return Response({'detail': f'Card error: {e.user_message}'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _process_payment_success(appointment, payment_method, gateway_charge_id, gateway_response):
    """Backwards-compatible wrapper around `_process_appointment_payment_success`.

    Existing call sites still pass an appointment positionally; this wrapper
    keeps them working while new code should call the target-specific
    functions directly (`_process_appointment_payment_success` or
    `_process_medicine_order_payment_success`).
    """
    return _process_appointment_payment_success(
        appointment, payment_method, gateway_charge_id, gateway_response,
    )


def _process_appointment_payment_success(appointment, payment_method, gateway_charge_id, gateway_response):
    """
    Shared logic for processing a successful payment (Stripe + PayPal) for an
    Appointment. Creates the Invoice + InvoiceLineItem + Payment, flips the
    appointment to 'Confirmed', creates notifications, and sends the
    confirmation email.

    Idempotent on two axes:
      - If appointment is already Confirmed, returns False without changes.
      - If a Payment with the same gateway_charge_id already exists, returns False.

    Returns True on the first successful processing.
    """
    # Idempotency guard 1: appointment already confirmed (webhook + verify race, etc.)
    if appointment.status == 'Confirmed':
        return False

    # Idempotency guard 2: this exact charge was already recorded
    if gateway_charge_id and Payment.objects.filter(gateway_charge_id=gateway_charge_id).exists():
        return False

    service = appointment.service
    total = service.cost if service else Decimal('0')

    # Create Invoice as Paid immediately — this is the lazy creation point
    invoice = Invoice.objects.create(
        appointment=appointment,
        patient=appointment.patient,
        subtotal=total,
        total=total,
        amount_paid=total,
        balance_due=Decimal('0'),
        status='Paid',
        issued_at=timezone.now(),
    )

    if service:
        InvoiceLineItem.objects.create(
            invoice=invoice,
            description=service.name,
            quantity=1,
            unit_price=service.cost,
            total=service.cost,
            service=service,
        )

    Payment.objects.create(
        invoice=invoice,
        amount=total,
        payment_method=payment_method,
        gateway_charge_id=gateway_charge_id,
        gateway_response=gateway_response,
        status='Completed',
        paid_at=timezone.now(),
    )

    appointment.status = 'Confirmed'
    appointment.save(update_fields=['status'])

    _create_appointment_notification(appointment)
    send_appointment_confirmation_email(appointment, invoice)
    return True


def _process_medicine_order_payment_success(order, payment_method, gateway_charge_id, gateway_response):
    """
    Shared logic for processing a successful payment (Stripe + PayPal) for a
    MedicineOrder. Creates the Invoice + InvoiceLineItem (one per item) +
    Payment, flips the order status to 'Paid'.

    Note: order items that were linked to a PrescriptionItem have a
    `unit_price == 0` (free via prescription). If the whole order total was
    zero the backend already marked it as Paid at creation time in
    `MedicineOrderCreateView`, so the paying path here is for orders with a
    positive balance.

    Idempotent on two axes (same guards as the appointment flow).
    """
    if order.status == 'Paid' and hasattr(order, 'invoice'):
        # Already paid and invoiced — nothing more to do.
        return False

    if gateway_charge_id and Payment.objects.filter(gateway_charge_id=gateway_charge_id).exists():
        return False

    total = order.total or Decimal('0')

    invoice = Invoice.objects.create(
        medicine_order=order,
        patient=order.patient,
        subtotal=order.subtotal or total,
        total=total,
        amount_paid=total,
        balance_due=Decimal('0'),
        status='Paid',
        issued_at=timezone.now(),
    )

    # One invoice line per medicine item, so the patient's billing history
    # shows exactly what they paid for.
    for idx, item in enumerate(order.items.select_related('medication').all()):
        InvoiceLineItem.objects.create(
            invoice=invoice,
            description=f'{item.medication.name}'
                        + (f' {item.medication.strength}' if item.medication.strength else '')
                        + f' x{item.quantity}',
            quantity=item.quantity,
            unit_price=item.unit_price,
            total=item.total,
            order=idx,
        )

    Payment.objects.create(
        invoice=invoice,
        amount=total,
        payment_method=payment_method,
        gateway_charge_id=gateway_charge_id,
        gateway_response=gateway_response,
        status='Completed',
        paid_at=timezone.now(),
    )

    # Assign a pickup code so the patient has something to show at the branch.
    # Already-present codes are left alone in the unlikely case this helper is
    # called twice for the same order.
    if not order.pickup_code:
        order.pickup_code = generate_unique_pickup_code()

    order.status = 'Paid'
    order.save(update_fields=['status', 'pickup_code'])

    # Notify the patient in-app and via email (with the QR attached inline).
    Notification.objects.create(
        recipient=order.patient.user,
        type='Medicine Order Paid',
        title='Medicine Order Paid',
        message=f'Your medicine order has been paid. Pickup code: {order.pickup_code}.',
    )
    try:
        qr_bytes = generate_qr_png_bytes(order.pickup_code)
        send_medicine_order_pickup_email(order, qr_bytes)
    except Exception:
        # The email helper is already fire-and-forget; this secondary try/except
        # only guards the QR generation itself so a rendering failure does not
        # roll back the payment transaction.
        pass
    return True


def _validate_medicine_order_for_payment(order):
    """Returns (order, error_message). Mirrors `_validate_appointment_for_payment`."""
    if order.status == 'Cancelled':
        return None, 'This order was cancelled.'
    if order.status == 'Paid':
        return None, 'Already paid.'
    if order.status != 'Pending Payment':
        return None, f'Cannot pay for an order in "{order.status}" state.'
    if (order.total or Decimal('0')) <= 0:
        return None, 'This order has no balance due.'
    return order, None


class StripeVerifyPaymentView(APIView):
    """Verifies a Stripe payment after redirect (fallback for webhook)."""
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request):
        appointment_sid = request.data.get('appointment_sid')
        session_id = request.data.get('session_id')

        if not appointment_sid:
            return Response({'detail': 'appointment_sid is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            appointment = Appointment.objects.get(sid=appointment_sid, patient=request.user.patient)
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_400_BAD_REQUEST)

        if appointment.status == 'Confirmed':
            return Response({'detail': 'Payment already processed.', 'status': appointment.status})

        try:
            if session_id:
                session = stripe.checkout.Session.retrieve(session_id)
            else:
                sessions = stripe.checkout.Session.list(limit=10)
                session = next(
                    (s for s in sessions.data if s.metadata.get('appointment_sid') == appointment_sid), None
                )
                if not session:
                    return Response({'detail': 'Stripe session not found.'}, status=status.HTTP_400_BAD_REQUEST)

            if session.payment_status == 'paid':
                _process_payment_success(
                    appointment, 'stripe',
                    session.payment_intent or '', {'session_id': session.id}
                )
                return Response({'detail': 'Payment verified.', 'status': appointment.status})
            else:
                return Response({'detail': 'Payment not completed yet.'}, status=status.HTTP_402_PAYMENT_REQUIRED)

        except Exception as e:
            return Response({'detail': f'Verification failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StripeWebhookView(APIView):
    """Handles Stripe webhook events."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        payload = request.body
        sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')

        if settings.STRIPE_WEBHOOK_SECRET:
            try:
                event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
            except (ValueError, stripe.error.SignatureVerificationError):
                return HttpResponse(status=400)
        else:
            import json
            event = json.loads(payload)

        if event['type'] == 'checkout.session.completed':
            session = event['data']['object']
            self._handle_checkout_completed(session)

        return HttpResponse(status=200)

    @transaction.atomic
    def _handle_checkout_completed(self, session):
        # session can be a Stripe object (from construct_event) or a dict (from json.loads)
        if isinstance(session, dict):
            metadata = session.get('metadata', {}) or {}
            payment_intent = session.get('payment_intent', '')
            session_id = session['id']
        else:
            metadata = session.metadata or {}
            payment_intent = session.payment_intent or ''
            session_id = session.id

        def _meta(key):
            if isinstance(metadata, dict):
                return metadata.get(key)
            return getattr(metadata, key, None)

        # The webhook is shared across appointment + medicine_order flows. We
        # ramify on a `kind` metadata field written by the checkout views. The
        # old appointment checkouts didn't set `kind` — they only wrote
        # `appointment_sid` — so we fall back to that to stay backwards
        # compatible with in-flight Stripe sessions.
        kind = _meta('kind')

        if kind == 'medicine_order':
            order_sid = _meta('medicine_order_sid')
            if not order_sid:
                return
            try:
                order = MedicineOrder.objects.get(sid=order_sid)
            except MedicineOrder.DoesNotExist:
                return
            _process_medicine_order_payment_success(
                order, 'stripe', payment_intent, {'session_id': session_id},
            )
            return

        # Appointment flow (explicit kind='appointment' OR legacy metadata)
        appointment_sid = _meta('appointment_sid')
        if not appointment_sid:
            return

        try:
            appointment = Appointment.objects.get(sid=appointment_sid)
        except Appointment.DoesNotExist:
            return

        _process_appointment_payment_success(
            appointment, 'stripe', payment_intent, {'session_id': session_id},
        )


class PayPalCreateOrderView(APIView):
    """Creates a PayPal order. No Invoice is created here."""
    permission_classes = [IsPatient]

    def post(self, request):
        appointment_sid = request.data.get('appointment_sid')

        try:
            appointment = Appointment.objects.get(
                sid=appointment_sid,
                patient=request.user.patient,
            )
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_400_BAD_REQUEST)

        service, error = _validate_appointment_for_payment(appointment)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        payment = paypalrestsdk.Payment({
            "intent": "sale",
            "payer": {"payment_method": "paypal"},
            "redirect_urls": {
                "return_url": f"{FRONTEND_URL}/dashboard/patient/booking/paypal-success?appointment={appointment.sid}",
                "cancel_url": f"{FRONTEND_URL}/dashboard/patient/booking/cancel?appointment={appointment.sid}",
            },
            "transactions": [{
                "amount": {"total": f'{service.cost:.2f}', "currency": "USD"},
                "description": f"Appointment: {service.name}",
                "custom": appointment.sid,
            }],
        })

        if payment.create():
            approval_url = next(
                (link.href for link in payment.links if link.rel == "approval_url"), None
            )
            return Response({'approval_url': approval_url, 'payment_id': payment.id})
        else:
            return Response({'detail': payment.error}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PayPalCaptureOrderView(APIView):
    """Captures a PayPal payment after approval."""
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request):
        payment_id = request.data.get('payment_id')
        payer_id = request.data.get('payer_id')
        appointment_sid = request.data.get('appointment_sid')

        if not payment_id or not payer_id or not appointment_sid:
            return Response({'detail': 'Missing required fields.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            appointment = Appointment.objects.get(sid=appointment_sid, patient=request.user.patient)
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_400_BAD_REQUEST)

        if appointment.status == 'Confirmed':
            return Response({'detail': 'Already paid.', 'appointment_sid': appointment.sid})

        payment = paypalrestsdk.Payment.find(payment_id)

        if payment.execute({"payer_id": payer_id}):
            _process_payment_success(
                appointment, 'paypal',
                payment_id, payment.to_dict()
            )
            return Response({'detail': 'Payment successful.', 'appointment_sid': appointment.sid})
        else:
            return Response({'detail': payment.error}, status=status.HTTP_400_BAD_REQUEST)


class CancelPendingPaymentView(APIView):
    """
    Legacy endpoint kept for backward compatibility. Now only marks an appointment
    as Cancelled — Unpaid appointments should be deleted via
    PatientAppointmentDeleteView instead.
    """
    permission_classes = [IsPatient]

    def post(self, request):
        appointment_sid = request.data.get('appointment_sid')

        try:
            appointment = Appointment.objects.get(sid=appointment_sid, patient=request.user.patient)
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appointment.status == 'Confirmed':
            return Response({'detail': 'Cannot cancel a paid appointment this way.'}, status=status.HTTP_400_BAD_REQUEST)

        appointment.status = 'Cancelled'
        appointment.save(update_fields=['status'])
        return Response({'detail': 'Appointment cancelled.'})


# ============================================================================
# MedicineOrder payment views
# ============================================================================
#
# These mirror the Appointment payment flow but target a MedicineOrder. They
# reuse `Invoice`, `Payment` and the webhook — the only thing that changes is
# the metadata (`kind='medicine_order'`) and the helper that records the
# payment success.


class MedicineOrderStripeCheckoutView(APIView):
    """Creates a Stripe Checkout session for a MedicineOrder. No Invoice is
    created here — it is lazily created in `_process_medicine_order_payment_success`
    when the webhook (or verify endpoint) confirms the payment.
    """
    permission_classes = [IsPatient]

    def post(self, request):
        order_sid = request.data.get('order_sid')

        try:
            order = MedicineOrder.objects.get(sid=order_sid, patient=request.user.patient)
        except MedicineOrder.DoesNotExist:
            return Response({'detail': 'Order not found.'}, status=status.HTTP_400_BAD_REQUEST)

        _, error = _validate_medicine_order_for_payment(order)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        try:
            customer_id = get_or_create_stripe_customer(request.user.patient)

            # One Stripe line per medicine item so the checkout shows the
            # breakdown the patient expects.
            stripe_line_items = []
            for item in order.items.select_related('medication').all():
                # Items that are covered by prescription have unit_price=0 —
                # Stripe rejects $0 line items, so we skip them here. The DB
                # still records them via InvoiceLineItem at payment success.
                if (item.unit_price or Decimal('0')) <= 0:
                    continue
                description = (
                    f'{item.medication.name}'
                    + (f' {item.medication.strength}' if item.medication.strength else '')
                )
                stripe_line_items.append({
                    'price_data': {
                        'currency': 'usd',
                        'product_data': {
                            'name': description,
                            'description': item.medication.generic_name or description,
                        },
                        'unit_amount': int(item.unit_price * 100),
                    },
                    'quantity': item.quantity,
                })

            if not stripe_line_items:
                return Response(
                    {'detail': 'This order has no billable items.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            session_params = {
                'payment_method_types': ['card'],
                'line_items': stripe_line_items,
                'mode': 'payment',
                'success_url': f'{FRONTEND_URL}/dashboard/patient/medicine/payment/success?order={order.sid}&session_id={{CHECKOUT_SESSION_ID}}',
                'cancel_url': f'{FRONTEND_URL}/dashboard/patient/medicine/payment/cancel?order={order.sid}',
                'metadata': {
                    'kind': 'medicine_order',
                    'medicine_order_sid': order.sid,
                },
            }

            if customer_id:
                session_params['customer'] = customer_id

            checkout_session = stripe.checkout.Session.create(**session_params)

            return Response({
                'checkout_url': checkout_session.url,
                'session_id': checkout_session.id,
            })

        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MedicineOrderStripeVerifyView(APIView):
    """Verifies a Stripe payment for a MedicineOrder after the user returns
    from Checkout (fallback for when the webhook hasn't fired yet).
    """
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request):
        order_sid = request.data.get('order_sid')
        session_id = request.data.get('session_id')

        if not order_sid:
            return Response({'detail': 'order_sid is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            order = MedicineOrder.objects.get(sid=order_sid, patient=request.user.patient)
        except MedicineOrder.DoesNotExist:
            return Response({'detail': 'Order not found.'}, status=status.HTTP_400_BAD_REQUEST)

        if order.status == 'Paid':
            return Response({'detail': 'Payment already processed.', 'status': order.status})

        try:
            if session_id:
                session = stripe.checkout.Session.retrieve(session_id)
            else:
                sessions = stripe.checkout.Session.list(limit=10)
                session = next(
                    (
                        s for s in sessions.data
                        if (s.metadata or {}).get('medicine_order_sid') == order_sid
                    ),
                    None,
                )
                if not session:
                    return Response({'detail': 'Stripe session not found.'}, status=status.HTTP_400_BAD_REQUEST)

            if session.payment_status == 'paid':
                _process_medicine_order_payment_success(
                    order, 'stripe',
                    session.payment_intent or '', {'session_id': session.id},
                )
                return Response({'detail': 'Payment verified.', 'status': order.status})
            else:
                return Response({'detail': 'Payment not completed yet.'}, status=status.HTTP_402_PAYMENT_REQUIRED)

        except Exception as e:
            return Response({'detail': f'Verification failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MedicineOrderPayPalCreateView(APIView):
    """Creates a PayPal order for a MedicineOrder."""
    permission_classes = [IsPatient]

    def post(self, request):
        order_sid = request.data.get('order_sid')

        try:
            order = MedicineOrder.objects.get(sid=order_sid, patient=request.user.patient)
        except MedicineOrder.DoesNotExist:
            return Response({'detail': 'Order not found.'}, status=status.HTTP_400_BAD_REQUEST)

        _, error = _validate_medicine_order_for_payment(order)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        items = order.items.select_related('medication').all()
        description_bits = [f'{i.medication.name} x{i.quantity}' for i in items if (i.unit_price or Decimal('0')) > 0]
        description = ', '.join(description_bits) or 'Medicine order'
        # PayPal description has a maximum length — keep it conservative.
        if len(description) > 120:
            description = description[:117] + '...'

        payment = paypalrestsdk.Payment({
            "intent": "sale",
            "payer": {"payment_method": "paypal"},
            "redirect_urls": {
                "return_url": f"{FRONTEND_URL}/dashboard/patient/medicine/payment/paypal-success?order={order.sid}",
                "cancel_url": f"{FRONTEND_URL}/dashboard/patient/medicine/payment/cancel?order={order.sid}",
            },
            "transactions": [{
                "amount": {"total": f'{order.total:.2f}', "currency": "USD"},
                "description": description,
                "custom": order.sid,
            }],
        })

        if payment.create():
            approval_url = next(
                (link.href for link in payment.links if link.rel == "approval_url"), None
            )
            return Response({'approval_url': approval_url, 'payment_id': payment.id})
        else:
            return Response({'detail': payment.error}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MedicineOrderPayPalCaptureView(APIView):
    """Captures a PayPal payment for a MedicineOrder after approval."""
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request):
        payment_id = request.data.get('payment_id')
        payer_id = request.data.get('payer_id')
        order_sid = request.data.get('order_sid')

        if not payment_id or not payer_id or not order_sid:
            return Response({'detail': 'Missing required fields.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            order = MedicineOrder.objects.get(sid=order_sid, patient=request.user.patient)
        except MedicineOrder.DoesNotExist:
            return Response({'detail': 'Order not found.'}, status=status.HTTP_400_BAD_REQUEST)

        if order.status == 'Paid':
            return Response({'detail': 'Already paid.', 'order_sid': order.sid})

        payment = paypalrestsdk.Payment.find(payment_id)

        if payment.execute({"payer_id": payer_id}):
            _process_medicine_order_payment_success(
                order, 'paypal', payment_id, payment.to_dict(),
            )
            return Response({'detail': 'Payment successful.', 'order_sid': order.sid})
        else:
            return Response({'detail': payment.error}, status=status.HTTP_400_BAD_REQUEST)
