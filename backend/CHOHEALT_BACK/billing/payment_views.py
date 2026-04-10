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
from base.models import Appointment, Service, Branch
from doctor.models import Doctor, Notification
from .stripe_customer import get_or_create_stripe_customer
from .models import Invoice, InvoiceLineItem, Payment
from userauths.services.email_service import send_appointment_confirmation_email

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
    Creates an appointment with status 'Scheduled' and an Invoice.
    Payment status is tracked separately via Invoice.
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
            status='Scheduled',
        )

        invoice = Invoice.objects.create(
            appointment=appointment,
            patient=patient,
            subtotal=service.cost,
            total=service.cost,
            balance_due=service.cost,
            status='Issued',
        )

        InvoiceLineItem.objects.create(
            invoice=invoice,
            description=service.name,
            quantity=1,
            unit_price=service.cost,
            total=service.cost,
            service=service,
        )

        return Response({
            'appointment_sid': appointment.sid,
            'invoice_sid': invoice.sid,
            'invoice_number': invoice.invoice_number,
            'amount': str(service.cost),
            'service_name': service.name,
        }, status=status.HTTP_201_CREATED)


class StripeCheckoutView(APIView):
    """Creates a Stripe Checkout session."""
    permission_classes = [IsPatient]

    def post(self, request):
        appointment_sid = request.data.get('appointment_sid')

        try:
            appointment = Appointment.objects.get(
                sid=appointment_sid,
                patient=request.user.patient,
            )
            invoice = appointment.invoice
            if invoice.status == 'Paid':
                return Response({'detail': 'Already paid.'}, status=status.HTTP_400_BAD_REQUEST)
        except (Appointment.DoesNotExist, Invoice.DoesNotExist):
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Get or create Stripe customer for card saving
            customer_id = get_or_create_stripe_customer(request.user.patient)
            save_card = request.data.get('save_card', False)

            session_params = {
                'payment_method_types': ['card'],
                'line_items': [{
                    'price_data': {
                        'currency': 'usd',
                        'product_data': {
                            'name': f'Appointment: {appointment.service.name if appointment.service else "Service"}',
                            'description': f'Dr. {appointment.doctor.first_name} {appointment.doctor.first_last_name}' if appointment.doctor else 'Lab Service',
                        },
                        'unit_amount': int(invoice.total * 100),
                    },
                    'quantity': 1,
                }],
                'mode': 'payment',
                'success_url': f'{FRONTEND_URL}/dashboard/patient/booking/success?appointment={appointment.sid}&session_id={{CHECKOUT_SESSION_ID}}',
                'cancel_url': f'{FRONTEND_URL}/dashboard/patient/booking/cancel?appointment={appointment.sid}',
                'metadata': {
                    'appointment_sid': appointment.sid,
                    'invoice_sid': invoice.sid,
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
    """Pay with a saved card using PaymentIntent (no redirect)."""
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
            invoice = appointment.invoice
            if invoice.status == 'Paid':
                return Response({'detail': 'Already paid.'}, status=status.HTTP_400_BAD_REQUEST)
        except (Appointment.DoesNotExist, Invoice.DoesNotExist):
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payment_intent = stripe.PaymentIntent.create(
                amount=int(invoice.total * 100),
                currency='usd',
                customer=patient.stripe_customer_id,
                payment_method=payment_method_id,
                off_session=True,
                confirm=True,
                metadata={
                    'appointment_sid': appointment.sid,
                    'invoice_sid': invoice.sid,
                },
            )

            if payment_intent.status == 'succeeded':
                _process_payment_success(
                    appointment, invoice, 'stripe',
                    payment_intent.id, {'payment_intent_id': payment_intent.id}
                )
                return Response({'detail': 'Payment successful.', 'appointment_sid': appointment.sid})
            else:
                return Response({'detail': 'Payment requires additional action.', 'client_secret': payment_intent.client_secret}, status=status.HTTP_402_PAYMENT_REQUIRED)

        except stripe.error.CardError as e:
            return Response({'detail': f'Card error: {e.user_message}'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _process_payment_success(appointment, invoice, payment_method, gateway_charge_id, gateway_response):
    """Shared logic for processing successful payment (Stripe + PayPal).
    Returns True if the payment was actually processed, False if already handled (idempotent).
    """
    # Check idempotency
    if Payment.objects.filter(gateway_charge_id=gateway_charge_id).exists():
        return False

    Payment.objects.create(
        invoice=invoice,
        amount=invoice.total,
        payment_method=payment_method,
        gateway_charge_id=gateway_charge_id,
        gateway_response=gateway_response,
        status='Completed',
        paid_at=timezone.now(),
    )

    invoice.amount_paid = invoice.total
    invoice.balance_due = Decimal('0')
    invoice.status = 'Paid'
    invoice.issued_at = timezone.now()
    invoice.save()

    appointment.status = 'Confirmed'
    appointment.save()

    _create_appointment_notification(appointment)
    return True


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
            invoice = appointment.invoice
        except (Appointment.DoesNotExist, Invoice.DoesNotExist):
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_400_BAD_REQUEST)

        if invoice.status == 'Paid':
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
                    appointment, invoice, 'stripe',
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
            metadata = session.get('metadata', {})
            payment_intent = session.get('payment_intent', '')
        else:
            metadata = session.metadata or {}
            payment_intent = session.payment_intent or ''

        appointment_sid = metadata.get('appointment_sid') if isinstance(metadata, dict) else getattr(metadata, 'appointment_sid', None)
        invoice_sid = metadata.get('invoice_sid') if isinstance(metadata, dict) else getattr(metadata, 'invoice_sid', None)

        if not appointment_sid or not invoice_sid:
            return

        try:
            appointment = Appointment.objects.get(sid=appointment_sid)
            invoice = Invoice.objects.get(sid=invoice_sid)
        except (Appointment.DoesNotExist, Invoice.DoesNotExist):
            return

        if invoice.status == 'Paid':
            return

        processed = _process_payment_success(
            appointment, invoice, 'stripe',
            payment_intent, {'session_id': session['id'] if isinstance(session, dict) else session.id}
        )
        if processed:
            send_appointment_confirmation_email(appointment, invoice)


class PayPalCreateOrderView(APIView):
    """Creates a PayPal order."""
    permission_classes = [IsPatient]

    def post(self, request):
        appointment_sid = request.data.get('appointment_sid')

        try:
            appointment = Appointment.objects.get(
                sid=appointment_sid,
                patient=request.user.patient,
            )
            invoice = appointment.invoice
            if invoice.status == 'Paid':
                return Response({'detail': 'Already paid.'}, status=status.HTTP_400_BAD_REQUEST)
        except (Appointment.DoesNotExist, Invoice.DoesNotExist):
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_400_BAD_REQUEST)

        payment = paypalrestsdk.Payment({
            "intent": "sale",
            "payer": {"payment_method": "paypal"},
            "redirect_urls": {
                "return_url": f"{FRONTEND_URL}/dashboard/patient/booking/paypal-success?appointment={appointment.sid}",
                "cancel_url": f"{FRONTEND_URL}/dashboard/patient/booking/cancel?appointment={appointment.sid}",
            },
            "transactions": [{
                "amount": {"total": str(invoice.total), "currency": "USD"},
                "description": f"Appointment: {appointment.service.name if appointment.service else 'Service'}",
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
            invoice = appointment.invoice
        except (Appointment.DoesNotExist, Invoice.DoesNotExist):
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_400_BAD_REQUEST)

        if invoice.status == 'Paid':
            return Response({'detail': 'Already paid.', 'appointment_sid': appointment.sid})

        payment = paypalrestsdk.Payment.find(payment_id)

        if payment.execute({"payer_id": payer_id}):
            _process_payment_success(
                appointment, invoice, 'paypal',
                payment_id, payment.to_dict()
            )
            return Response({'detail': 'Payment successful.', 'appointment_sid': appointment.sid})
        else:
            return Response({'detail': payment.error}, status=status.HTTP_400_BAD_REQUEST)


class CancelPendingPaymentView(APIView):
    """Cancels an unpaid appointment."""
    permission_classes = [IsPatient]

    def post(self, request):
        appointment_sid = request.data.get('appointment_sid')

        try:
            appointment = Appointment.objects.get(sid=appointment_sid, patient=request.user.patient)
            invoice = appointment.invoice
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Invoice.DoesNotExist:
            appointment.status = 'Cancelled'
            appointment.save()
            return Response({'detail': 'Appointment cancelled.'})

        if invoice.status == 'Paid':
            return Response({'detail': 'Cannot cancel a paid appointment this way.'}, status=status.HTTP_400_BAD_REQUEST)

        # Cancel appointment (soft cancel, not hard delete)
        appointment.status = 'Cancelled'
        appointment.save()

        invoice.status = 'Void'
        invoice.save()

        return Response({'detail': 'Appointment cancelled.'})
