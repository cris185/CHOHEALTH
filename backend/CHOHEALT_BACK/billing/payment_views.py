import stripe
import paypalrestsdk
from decimal import Decimal

from django.conf import settings
from django.utils import timezone
from django.db import transaction
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse

from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from patient.permissions import IsPatient
from base.models import Appointment, Service, Branch
from doctor.models import Doctor, Notification
from .models import Invoice, InvoiceLineItem, Payment
from .services import recompute_invoice_balance

stripe.api_key = settings.STRIPE_SECRET_KEY

paypalrestsdk.configure({
    "mode": settings.PAYPAL_MODE,
    "client_id": settings.PAYPAL_CLIENT_ID,
    "client_secret": settings.PAYPAL_CLIENT_SECRET,
})


class CreateAppointmentWithPaymentView(APIView):
    """
    Creates an appointment with status 'Pending Payment' and returns
    payment session URLs for Stripe and PayPal.
    """
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request):
        data = request.data
        patient = request.user.patient

        # Validate inputs
        try:
            doctor = Doctor.objects.get(sid=data.get('doctor_sid'))
            service = Service.objects.get(sid=data.get('service_sid'))
        except (Doctor.DoesNotExist, Service.DoesNotExist):
            return Response({'detail': 'Doctor or service not found.'}, status=status.HTTP_400_BAD_REQUEST)

        if not service.doctors.filter(pk=doctor.pk).exists():
            return Response({'detail': 'This doctor does not offer this service.'}, status=status.HTTP_400_BAD_REQUEST)

        # Create appointment with Pending Payment status
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
            status='Pending Payment',
        )

        # Create invoice
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
    """Creates a Stripe Checkout session for an appointment."""
    permission_classes = [IsPatient]

    def post(self, request):
        appointment_sid = request.data.get('appointment_sid')

        try:
            appointment = Appointment.objects.get(
                sid=appointment_sid,
                patient=request.user.patient,
                status='Pending Payment',
            )
            invoice = appointment.invoice
        except (Appointment.DoesNotExist, Invoice.DoesNotExist):
            return Response({'detail': 'Appointment not found or already paid.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            checkout_session = stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price_data': {
                        'currency': 'usd',
                        'product_data': {
                            'name': f'Appointment: {appointment.service.name}',
                            'description': f'Dr. {appointment.doctor.first_name} {appointment.doctor.first_last_name}',
                        },
                        'unit_amount': int(invoice.total * 100),
                    },
                    'quantity': 1,
                }],
                mode='payment',
                success_url='http://localhost:3000/dashboard/patient/booking/success?appointment=' + appointment.sid + '&session_id={CHECKOUT_SESSION_ID}',
                cancel_url=f'http://localhost:3000/dashboard/patient/booking/cancel?appointment={appointment.sid}',
                metadata={
                    'appointment_sid': appointment.sid,
                    'invoice_sid': invoice.sid,
                },
            )

            return Response({
                'checkout_url': checkout_session.url,
                'session_id': checkout_session.id,
            })

        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StripeVerifyPaymentView(APIView):
    """Verifies a Stripe Checkout session after redirect (fallback for webhook)."""
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request):
        appointment_sid = request.data.get('appointment_sid')
        session_id = request.data.get('session_id')

        if not appointment_sid:
            return Response({'detail': 'appointment_sid is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            appointment = Appointment.objects.get(
                sid=appointment_sid,
                patient=request.user.patient,
            )
            invoice = appointment.invoice
        except (Appointment.DoesNotExist, Invoice.DoesNotExist):
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_400_BAD_REQUEST)

        # Already processed
        if appointment.status != 'Pending Payment':
            return Response({'detail': 'Payment already processed.', 'status': appointment.status})

        # Verify with Stripe
        try:
            if session_id:
                session = stripe.checkout.Session.retrieve(session_id)
            else:
                # Find session by metadata
                sessions = stripe.checkout.Session.list(limit=10)
                session = next(
                    (s for s in sessions.data if s.metadata.get('appointment_sid') == appointment_sid),
                    None,
                )
                if not session:
                    return Response({'detail': 'Stripe session not found.'}, status=status.HTTP_400_BAD_REQUEST)

            if session.payment_status == 'paid':
                # Check if payment already exists (idempotency)
                if not Payment.objects.filter(gateway_charge_id=session.payment_intent).exists():
                    Payment.objects.create(
                        invoice=invoice,
                        amount=invoice.total,
                        payment_method='stripe',
                        gateway_charge_id=session.payment_intent or '',
                        gateway_response={'session_id': session.id, 'payment_status': session.payment_status},
                        status='Completed',
                        paid_at=timezone.now(),
                    )

                    invoice.amount_paid = invoice.total
                    invoice.balance_due = Decimal('0')
                    invoice.status = 'Paid'
                    invoice.issued_at = timezone.now()
                    invoice.save()

                    appointment.status = 'Pending'
                    appointment.save()

                    Notification.objects.create(
                        doctor=appointment.doctor,
                        patient=appointment.patient,
                        type='New Appointment',
                        message=f'New appointment booked by {appointment.patient.full_name} for {appointment.service.name} on {appointment.date.strftime("%b %d, %Y at %I:%M %p")}',
                    )

                return Response({'detail': 'Payment verified and appointment confirmed.', 'status': 'Pending'})
            else:
                return Response({'detail': 'Payment not completed yet.', 'payment_status': session.payment_status}, status=status.HTTP_402_PAYMENT_REQUIRED)

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
                event = stripe.Webhook.construct_event(
                    payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
                )
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
        appointment_sid = session.get('metadata', {}).get('appointment_sid')
        invoice_sid = session.get('metadata', {}).get('invoice_sid')

        if not appointment_sid or not invoice_sid:
            return

        try:
            appointment = Appointment.objects.get(sid=appointment_sid, status='Pending Payment')
            invoice = Invoice.objects.get(sid=invoice_sid)
        except (Appointment.DoesNotExist, Invoice.DoesNotExist):
            return

        # Create payment record
        Payment.objects.create(
            invoice=invoice,
            amount=invoice.total,
            payment_method='stripe',
            gateway_charge_id=session.get('payment_intent', ''),
            gateway_response=session,
            status='Completed',
            paid_at=timezone.now(),
        )

        # Update invoice
        invoice.amount_paid = invoice.total
        invoice.balance_due = Decimal('0')
        invoice.status = 'Paid'
        invoice.issued_at = timezone.now()
        invoice.save()

        # Update appointment
        appointment.status = 'Pending'
        appointment.save()

        # Create notification for doctor
        Notification.objects.create(
            doctor=appointment.doctor,
            patient=appointment.patient,
            type='New Appointment',
            message=f'New appointment booked by {appointment.patient.full_name} for {appointment.service.name} on {appointment.date.strftime("%b %d, %Y at %I:%M %p")}',
        )


class PayPalCreateOrderView(APIView):
    """Creates a PayPal order for an appointment."""
    permission_classes = [IsPatient]

    def post(self, request):
        appointment_sid = request.data.get('appointment_sid')

        try:
            appointment = Appointment.objects.get(
                sid=appointment_sid,
                patient=request.user.patient,
                status='Pending Payment',
            )
            invoice = appointment.invoice
        except (Appointment.DoesNotExist, Invoice.DoesNotExist):
            return Response({'detail': 'Appointment not found or already paid.'}, status=status.HTTP_400_BAD_REQUEST)

        payment = paypalrestsdk.Payment({
            "intent": "sale",
            "payer": {"payment_method": "paypal"},
            "redirect_urls": {
                "return_url": f"http://localhost:3000/dashboard/patient/booking/paypal-success?appointment={appointment.sid}",
                "cancel_url": f"http://localhost:3000/dashboard/patient/booking/cancel?appointment={appointment.sid}",
            },
            "transactions": [{
                "amount": {
                    "total": str(invoice.total),
                    "currency": "USD",
                },
                "description": f"Appointment: {appointment.service.name} - Dr. {appointment.doctor.first_name} {appointment.doctor.first_last_name}",
                "custom": appointment.sid,
            }],
        })

        if payment.create():
            approval_url = next(
                (link.href for link in payment.links if link.rel == "approval_url"), None
            )
            return Response({
                'approval_url': approval_url,
                'payment_id': payment.id,
            })
        else:
            return Response({'detail': payment.error}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PayPalCaptureOrderView(APIView):
    """Captures/executes a PayPal payment after patient approves."""
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request):
        payment_id = request.data.get('payment_id')
        payer_id = request.data.get('payer_id')
        appointment_sid = request.data.get('appointment_sid')

        if not payment_id or not payer_id or not appointment_sid:
            return Response({'detail': 'Missing payment_id, payer_id, or appointment_sid.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            appointment = Appointment.objects.get(
                sid=appointment_sid,
                patient=request.user.patient,
                status='Pending Payment',
            )
            invoice = appointment.invoice
        except (Appointment.DoesNotExist, Invoice.DoesNotExist):
            return Response({'detail': 'Appointment not found or already paid.'}, status=status.HTTP_400_BAD_REQUEST)

        payment = paypalrestsdk.Payment.find(payment_id)

        if payment.execute({"payer_id": payer_id}):
            # Create payment record
            Payment.objects.create(
                invoice=invoice,
                amount=invoice.total,
                payment_method='paypal',
                gateway_charge_id=payment_id,
                gateway_response=payment.to_dict(),
                status='Completed',
                paid_at=timezone.now(),
            )

            # Update invoice
            invoice.amount_paid = invoice.total
            invoice.balance_due = Decimal('0')
            invoice.status = 'Paid'
            invoice.issued_at = timezone.now()
            invoice.save()

            # Update appointment
            appointment.status = 'Pending'
            appointment.save()

            # Create notification
            Notification.objects.create(
                doctor=appointment.doctor,
                patient=appointment.patient,
                type='New Appointment',
                message=f'New appointment booked by {appointment.patient.full_name} for {appointment.service.name} on {appointment.date.strftime("%b %d, %Y at %I:%M %p")}',
            )

            return Response({'detail': 'Payment successful.', 'appointment_sid': appointment.sid})
        else:
            return Response({'detail': payment.error}, status=status.HTTP_400_BAD_REQUEST)


class CancelPendingPaymentView(APIView):
    """Cancels an appointment that was pending payment."""
    permission_classes = [IsPatient]

    def post(self, request):
        appointment_sid = request.data.get('appointment_sid')

        try:
            appointment = Appointment.objects.get(
                sid=appointment_sid,
                patient=request.user.patient,
                status='Pending Payment',
            )
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Delete invoice and appointment
        if hasattr(appointment, 'invoice'):
            appointment.invoice.line_items.all().delete()
            appointment.invoice.delete()

        appointment.delete()

        return Response({'detail': 'Appointment cancelled.'})