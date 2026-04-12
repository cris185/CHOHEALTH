"""
Refund processing for Stripe and PayPal.

Single entry point: `process_refund(payment, amount, reason, reason_detail, processed_by)`.
Handles gateway call + Refund record + Invoice/Payment status updates atomically.

Cancellation policy (patient-initiated) is calculated by `calculate_refund_amount`:
- > 48h before appointment  →  100%
-  24-48h before appointment →  50%
- < 24h before appointment  →  0%
"""

import logging
from decimal import Decimal, ROUND_HALF_UP

import stripe
import paypalrestsdk

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Payment, Refund

logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY

paypalrestsdk.configure({
    'mode': settings.PAYPAL_MODE,
    'client_id': settings.PAYPAL_CLIENT_ID,
    'client_secret': settings.PAYPAL_CLIENT_SECRET,
})


# ============================================================================
# Policy: how much to refund based on how far the appointment is
# ============================================================================

def calculate_refund_amount(payment: Payment, appointment_date) -> Decimal:
    """
    Tiered patient-cancellation policy:
      > 48h  → 100%
      24-48h → 50%
      < 24h  → 0%

    `appointment_date` must be timezone-aware.
    Returns a rounded Decimal (2 places).
    """
    now = timezone.now()
    hours_until = (appointment_date - now).total_seconds() / 3600

    if hours_until >= 48:
        percent = Decimal('1.00')
    elif hours_until >= 24:
        percent = Decimal('0.50')
    else:
        percent = Decimal('0.00')

    amount = (payment.amount * percent).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return amount


# ============================================================================
# Gateway calls
# ============================================================================

def _refund_stripe(payment: Payment, amount: Decimal) -> dict:
    """Refund a Stripe Payment. Returns {ok, refund_id, response, error}."""
    try:
        amount_cents = int((amount * 100).quantize(Decimal('1')))
        stripe_refund = stripe.Refund.create(
            payment_intent=payment.gateway_charge_id,
            amount=amount_cents,
            reason='requested_by_customer',
        )
        return {
            'ok': True,
            'refund_id': stripe_refund.id,
            'response': stripe_refund.to_dict() if hasattr(stripe_refund, 'to_dict') else dict(stripe_refund),
            'error': None,
        }
    except stripe.error.StripeError as e:
        logger.error(f'Stripe refund failed for payment {payment.sid}: {e}')
        return {
            'ok': False,
            'refund_id': '',
            'response': {'error': str(e), 'user_message': getattr(e, 'user_message', '')},
            'error': getattr(e, 'user_message', None) or str(e),
        }
    except Exception as e:
        logger.error(f'Unexpected Stripe refund error for payment {payment.sid}: {e}')
        return {'ok': False, 'refund_id': '', 'response': {'error': str(e)}, 'error': str(e)}


def _refund_paypal(payment: Payment, amount: Decimal) -> dict:
    """Refund a PayPal Payment. Returns {ok, refund_id, response, error}."""
    try:
        paypal_payment = paypalrestsdk.Payment.find(payment.gateway_charge_id)
        sale_id = None
        for tx in paypal_payment.transactions:
            for related in tx.related_resources:
                if hasattr(related, 'sale'):
                    sale_id = related.sale.id
                    break
            if sale_id:
                break

        if not sale_id:
            return {'ok': False, 'refund_id': '', 'response': {'error': 'No sale found on PayPal payment.'}, 'error': 'No sale found.'}

        sale = paypalrestsdk.Sale.find(sale_id)
        refund_response = sale.refund({
            'amount': {'total': f'{amount:.2f}', 'currency': 'USD'},
        })

        if refund_response.success():
            return {
                'ok': True,
                'refund_id': refund_response.id,
                'response': refund_response.to_dict(),
                'error': None,
            }
        return {
            'ok': False,
            'refund_id': '',
            'response': {'error': str(refund_response.error)},
            'error': str(refund_response.error),
        }
    except Exception as e:
        logger.error(f'PayPal refund failed for payment {payment.sid}: {e}')
        return {'ok': False, 'refund_id': '', 'response': {'error': str(e)}, 'error': str(e)}


# ============================================================================
# Public API
# ============================================================================

@transaction.atomic
def process_refund(payment: Payment, amount: Decimal, reason: str, reason_detail: str = '', processed_by=None) -> Refund:
    """
    Process a refund against a Payment. Calls the gateway, creates a Refund record,
    and updates Invoice/Payment status. Atomic — if the gateway fails, no DB changes.

    Args:
        payment: the Payment to refund against (must have status='Completed' and a gateway_charge_id).
        amount: Decimal amount to refund. Must be > 0 and <= payment.amount minus already-refunded.
        reason: one of REFUND_REASON codes ('appointment_cancelled', etc.).
        reason_detail: optional human-readable detail.
        processed_by: User who triggered it (for audit trail).

    Returns:
        The Refund object (status='Completed' on success, 'Rejected' on gateway failure).

    Raises:
        ValueError on invalid input (zero amount, already fully refunded, unsupported method).
    """
    if amount <= 0:
        raise ValueError('Refund amount must be greater than zero.')

    already_refunded = sum(
        r.amount for r in payment.refunds.filter(status='Completed')
    )
    if already_refunded + amount > payment.amount:
        raise ValueError('Refund would exceed the payment amount.')

    # Gateway dispatch
    if payment.payment_method == 'stripe':
        result = _refund_stripe(payment, amount)
    elif payment.payment_method == 'paypal':
        result = _refund_paypal(payment, amount)
    else:
        raise ValueError(f'Refunds not supported for payment method: {payment.payment_method}')

    # Create Refund record (Completed or Rejected depending on gateway outcome)
    refund = Refund.objects.create(
        payment=payment,
        amount=amount,
        reason=reason,
        reason_detail=reason_detail,
        gateway_refund_id=result['refund_id'],
        gateway_response=result['response'],
        status='Completed' if result['ok'] else 'Rejected',
        processed_by=processed_by,
        processed_at=timezone.now() if result['ok'] else None,
    )

    # If the gateway rejected, bail out — no Invoice/Payment changes
    if not result['ok']:
        return refund

    # Update Invoice totals
    invoice = payment.invoice
    new_refunded_total = already_refunded + amount
    if new_refunded_total >= payment.amount:
        invoice.status = 'Refunded'
        invoice.amount_paid = Decimal('0')
        invoice.balance_due = invoice.total
    else:
        invoice.amount_paid = invoice.total - new_refunded_total
        invoice.balance_due = new_refunded_total
    invoice.save(update_fields=['status', 'amount_paid', 'balance_due', 'updated_at'])

    return refund
