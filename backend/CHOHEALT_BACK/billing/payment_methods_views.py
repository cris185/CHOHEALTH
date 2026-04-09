import stripe
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from patient.permissions import IsPatient
from .stripe_customer import (
    get_or_create_stripe_customer, list_saved_cards,
    delete_saved_card, create_setup_intent,
)

stripe.api_key = settings.STRIPE_SECRET_KEY


class SavedCardsListView(APIView):
    """List patient's saved credit cards from Stripe."""
    permission_classes = [IsPatient]

    def get(self, request):
        patient = request.user.patient
        cards = list_saved_cards(patient)
        return Response(cards)


class SaveCardSetupView(APIView):
    """Create a Stripe SetupIntent for saving a new card."""
    permission_classes = [IsPatient]

    def post(self, request):
        patient = request.user.patient
        result = create_setup_intent(patient)
        if result:
            return Response(result)
        return Response({'detail': 'Could not create setup session.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DeleteSavedCardView(APIView):
    """Delete a saved payment method."""
    permission_classes = [IsPatient]

    def delete(self, request, payment_method_id):
        patient = request.user.patient
        success = delete_saved_card(patient, payment_method_id)
        if success:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response({'detail': 'Failed to delete card.'}, status=status.HTTP_400_BAD_REQUEST)


class SetDefaultCardView(APIView):
    """Set a saved card as default payment method."""
    permission_classes = [IsPatient]

    def post(self, request):
        patient = request.user.patient
        payment_method_id = request.data.get('payment_method_id')

        if not patient.stripe_customer_id or not payment_method_id:
            return Response({'detail': 'Invalid request.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            stripe.Customer.modify(
                patient.stripe_customer_id,
                invoice_settings={'default_payment_method': payment_method_id},
            )
            return Response({'detail': 'Default card updated.'})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
