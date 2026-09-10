from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from userauths.models import User
from base.models import MedicineDelivery

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
