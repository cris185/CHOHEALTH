from rest_framework import generics, status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from django.utils import timezone

from userauths.views import _BaseRegisterView

from .assignment import expire_stale_offers, accept_offer, decline_offer
from .models import DeliveryShift, DeliveryBreak, DeliveryOffer
from .permissions import IsDeliveryPerson
from .serializers import DeliveryPersonRegisterSerializer, DeliveryPersonProfileSerializer


class DeliveryPersonRegisterView(_BaseRegisterView):
    serializer_class = DeliveryPersonRegisterSerializer


class DeliveryPersonProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = DeliveryPersonProfileSerializer
    permission_classes = [IsDeliveryPerson]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self):
        return self.request.user.delivery_person


def _active_shift(delivery_person):
    return DeliveryShift.objects.filter(delivery_person=delivery_person, clock_out_at__isnull=True).first()


class ClockInView(APIView):
    permission_classes = [IsDeliveryPerson]

    def post(self, request):
        dp = request.user.delivery_person
        if _active_shift(dp):
            return Response({'detail': 'Already clocked in.'}, status=status.HTTP_400_BAD_REQUEST)
        DeliveryShift.objects.create(delivery_person=dp)
        dp.on_duty_status = 'on_duty'
        dp.save(update_fields=['on_duty_status'])
        return Response({'on_duty_status': dp.on_duty_status})


class ClockOutView(APIView):
    permission_classes = [IsDeliveryPerson]

    def post(self, request):
        dp = request.user.delivery_person
        if dp.has_active_delivery:
            return Response(
                {'detail': 'Cannot clock out with an active delivery assigned.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        shift = _active_shift(dp)
        if not shift:
            return Response({'detail': 'Not clocked in.'}, status=status.HTTP_400_BAD_REQUEST)
        # Close out any break still open on this shift — clocking out ends
        # the whole shift regardless of break state.
        DeliveryBreak.objects.filter(shift=shift, ended_at__isnull=True).update(ended_at=timezone.now())
        shift.clock_out_at = timezone.now()
        shift.save(update_fields=['clock_out_at'])
        dp.on_duty_status = 'off_duty'
        dp.save(update_fields=['on_duty_status'])
        return Response({'on_duty_status': dp.on_duty_status})


class BreakStartView(APIView):
    permission_classes = [IsDeliveryPerson]

    def post(self, request):
        dp = request.user.delivery_person
        if dp.has_active_delivery:
            return Response(
                {'detail': 'Cannot start a break with an active delivery assigned.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        shift = _active_shift(dp)
        if not shift:
            return Response({'detail': 'Not clocked in.'}, status=status.HTTP_400_BAD_REQUEST)
        if DeliveryBreak.objects.filter(shift=shift, ended_at__isnull=True).exists():
            return Response({'detail': 'Already on a break.'}, status=status.HTTP_400_BAD_REQUEST)
        DeliveryBreak.objects.create(shift=shift)
        dp.on_duty_status = 'on_break'
        dp.save(update_fields=['on_duty_status'])
        return Response({'on_duty_status': dp.on_duty_status})


class BreakEndView(APIView):
    permission_classes = [IsDeliveryPerson]

    def post(self, request):
        dp = request.user.delivery_person
        shift = _active_shift(dp)
        active_break = DeliveryBreak.objects.filter(shift=shift, ended_at__isnull=True).first() if shift else None
        if not active_break:
            return Response({'detail': 'Not on a break.'}, status=status.HTTP_400_BAD_REQUEST)
        active_break.ended_at = timezone.now()
        active_break.save(update_fields=['ended_at'])
        dp.on_duty_status = 'on_duty'
        dp.save(update_fields=['on_duty_status'])
        return Response({'on_duty_status': dp.on_duty_status})


class LocationPingView(APIView):
    """Called every ~10-15s by the Expo app's background location task while
    the courier is on duty — including while idle, not just mid-delivery,
    since the assignment algorithm needs a current position to rank by
    proximity even before anything is offered.
    """
    permission_classes = [IsDeliveryPerson]

    def patch(self, request):
        dp = request.user.delivery_person
        if dp.on_duty_status == 'off_duty':
            return Response({'detail': 'Not on duty.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            lat = request.data['latitude']
            lng = request.data['longitude']
        except KeyError:
            return Response({'detail': 'latitude and longitude are required.'}, status=status.HTTP_400_BAD_REQUEST)
        dp.current_latitude = lat
        dp.current_longitude = lng
        dp.location_updated_at = timezone.now()
        dp.save(update_fields=['current_latitude', 'current_longitude', 'location_updated_at'])
        return Response({'location_updated_at': dp.location_updated_at})


class MyPendingOfferView(APIView):
    """For the app to recover state on (re)launch — what offer, if any, is
    currently waiting on this courier's response."""
    permission_classes = [IsDeliveryPerson]

    def get(self, request):
        dp = request.user.delivery_person
        expire_stale_offers(dp)
        offer = DeliveryOffer.objects.filter(delivery_person=dp, status='pending').select_related('delivery').first()
        if not offer:
            return Response(None)
        return Response({
            'sid': offer.sid,
            'delivery_sid': offer.delivery.sid,
            'address': offer.delivery.address,
            'expires_at': offer.expires_at,
        })


class DeliveryOfferAcceptView(APIView):
    permission_classes = [IsDeliveryPerson]

    def post(self, request, sid):
        dp = request.user.delivery_person
        try:
            offer = DeliveryOffer.objects.get(sid=sid, delivery_person=dp)
        except DeliveryOffer.DoesNotExist:
            return Response({'detail': 'Offer not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not accept_offer(offer):
            return Response({'detail': 'This offer is no longer available.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'delivery_sid': offer.delivery.sid, 'status': 'accepted'})


class DeliveryOfferDeclineView(APIView):
    permission_classes = [IsDeliveryPerson]

    def post(self, request, sid):
        dp = request.user.delivery_person
        try:
            offer = DeliveryOffer.objects.get(sid=sid, delivery_person=dp, status='pending')
        except DeliveryOffer.DoesNotExist:
            return Response({'detail': 'Offer not found.'}, status=status.HTTP_404_NOT_FOUND)
        decline_offer(offer)
        return Response({'status': 'declined'})


class MyDeliveriesView(APIView):
    """The courier's own queue — their currently active delivery (if any)
    plus recent history, for the app's home screen and the read-only web
    dashboard alike."""
    permission_classes = [IsDeliveryPerson]

    def get(self, request):
        dp = request.user.delivery_person
        deliveries = dp.deliveries.select_related('order', 'order__patient').order_by('-created_at')[:50]
        return Response([
            {
                'sid': d.sid,
                'order_sid': d.order.sid,
                'stage': d.stage,
                'address': d.address,
                'dest_lat': d.dest_latitude,
                'dest_lng': d.dest_longitude,
                'created_at': d.created_at.isoformat(),
                'delivered_at': d.delivered_at.isoformat() if d.delivered_at else None,
            }
            for d in deliveries
        ])
