from django.db import transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from userauths.models import User
from base.models import MedicineDelivery
from delivery.models import DeliveryPerson

from .permissions import IsAdmin
from .serializers import AdminUserSerializer, AdminDeliverySerializer

DELIVERY_SELECT_RELATED = ('order', 'order__patient', 'order__patient__user', 'courier', 'courier__user', 'origin_branch')


class AdminUserListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        users = User.objects.select_related('patient', 'doctor', 'delivery_person').order_by('-date_joined')
        return Response(AdminUserSerializer(users, many=True).data)


class AdminDeliveryListView(APIView):
    """Every MedicineDelivery across every patient/courier — the admin's
    global view. Per-user history (below) is the same data pre-filtered."""
    permission_classes = [IsAdmin]

    def get(self, request):
        deliveries = MedicineDelivery.objects.select_related(*DELIVERY_SELECT_RELATED).order_by('-created_at')
        return Response(AdminDeliverySerializer(deliveries, many=True).data)


class AdminAssignCourierView(APIView):
    """Manual override — an admin picks a courier for a delivery directly,
    bypassing the offer/cascade flow entirely. Covers the case the
    algorithm can't: every nearby courier declined or timed out and the
    delivery is just sitting there unassigned. Setting `courier` directly is
    enough for the courier's own app to pick it up as their active delivery
    (MyDeliveriesView filters by courier, not by an accepted offer) — no
    DeliveryOffer needs to exist for this to work.
    """
    permission_classes = [IsAdmin]

    @transaction.atomic
    def post(self, request, sid):
        try:
            delivery = MedicineDelivery.objects.select_for_update().get(sid=sid)
        except MedicineDelivery.DoesNotExist:
            return Response({'detail': 'Delivery not found.'}, status=status.HTTP_404_NOT_FOUND)
        if delivery.stage == 'delivered':
            return Response({'detail': 'This delivery is already delivered.'}, status=status.HTTP_400_BAD_REQUEST)

        courier_sid = request.data.get('courier_sid')
        if not courier_sid:
            return Response({'detail': 'courier_sid is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            courier = DeliveryPerson.objects.select_for_update().get(user__sid=courier_sid)
        except DeliveryPerson.DoesNotExist:
            return Response({'detail': 'Courier not found.'}, status=status.HTTP_404_NOT_FOUND)

        if courier.deliveries.exclude(stage='delivered').exclude(pk=delivery.pk).exists():
            return Response(
                {'detail': f'{courier.full_name} already has an active delivery — one at a time.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        delivery.courier = courier
        delivery.save(update_fields=['courier'])
        # Any offer still pending for this delivery is now moot — an admin
        # stepped in ahead of (or instead of) the cascade resolving it.
        delivery.offers.filter(status='pending').update(status='expired', responded_at=timezone.now())

        return Response(AdminDeliverySerializer(delivery).data)


class AdminUserDeliveryHistoryView(APIView):
    """Deliveries tied to one user — as the patient who received them, or as
    the courier who ran them. Neither for a Doctor/Superuser account."""
    permission_classes = [IsAdmin]

    def get(self, request, sid):
        try:
            user = User.objects.select_related('patient', 'doctor', 'delivery_person').get(sid=sid)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        if hasattr(user, 'patient'):
            deliveries = MedicineDelivery.objects.filter(order__patient=user.patient)
        elif hasattr(user, 'delivery_person'):
            deliveries = MedicineDelivery.objects.filter(courier=user.delivery_person)
        else:
            deliveries = MedicineDelivery.objects.none()

        deliveries = deliveries.select_related(*DELIVERY_SELECT_RELATED).order_by('-created_at')
        return Response({
            'user': AdminUserSerializer(user).data,
            'deliveries': AdminDeliverySerializer(deliveries, many=True).data,
        })
