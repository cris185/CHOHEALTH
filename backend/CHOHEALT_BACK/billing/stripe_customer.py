import stripe
import logging
from django.conf import settings

stripe.api_key = settings.STRIPE_SECRET_KEY
logger = logging.getLogger(__name__)


def get_or_create_stripe_customer(patient):
    """Get or create a Stripe Customer for a patient. Returns customer_id."""
    if patient.stripe_customer_id:
        return patient.stripe_customer_id

    try:
        customer = stripe.Customer.create(
            email=patient.user.email,
            name=patient.full_name,
            metadata={'patient_sid': patient.sid},
        )
        patient.stripe_customer_id = customer.id
        patient.save(update_fields=['stripe_customer_id'])
        return customer.id
    except Exception as e:
        logger.error(f'Failed to create Stripe customer: {e}')
        return None


def list_saved_cards(patient):
    """List saved payment methods for a patient."""
    if not patient.stripe_customer_id:
        return []

    try:
        payment_methods = stripe.PaymentMethod.list(
            customer=patient.stripe_customer_id,
            type='card',
        )
        cards = []
        for pm in payment_methods.data:
            card = pm.card
            cards.append({
                'id': pm.id,
                'brand': card.brand,
                'last4': card.last4,
                'exp_month': card.exp_month,
                'exp_year': card.exp_year,
                'is_default': False,
            })

        # Check default payment method
        customer = stripe.Customer.retrieve(patient.stripe_customer_id)
        default_pm = customer.invoice_settings.default_payment_method if customer.invoice_settings else None
        for card in cards:
            if card['id'] == default_pm:
                card['is_default'] = True

        return cards
    except Exception as e:
        logger.error(f'Failed to list Stripe cards: {e}')
        return []


def delete_saved_card(patient, payment_method_id):
    """Detach a saved payment method from the customer."""
    try:
        stripe.PaymentMethod.detach(payment_method_id)
        return True
    except Exception as e:
        logger.error(f'Failed to delete card: {e}')
        return False


def create_setup_intent(patient):
    """Create a SetupIntent for saving a card without charging."""
    customer_id = get_or_create_stripe_customer(patient)
    if not customer_id:
        return None

    try:
        setup_intent = stripe.SetupIntent.create(
            customer=customer_id,
            payment_method_types=['card'],
        )
        return {
            'client_secret': setup_intent.client_secret,
            'setup_intent_id': setup_intent.id,
        }
    except Exception as e:
        logger.error(f'Failed to create SetupIntent: {e}')
        return None
