"""Endpoints for the medicine delivery flow.

Two entry points create a MedicineOrder destined for delivery:
  1) `PrescriptionDeliveryCreateView` — bundles all unclaimed prescribed
     medicines into a single order. Shipping fee applies ($10).
  2) `MedicineOrderCreateView` (in medical_views) — already supports
     `delivery_method='delivery'` for direct cart purchases. Shipping is free
     because the medicine price already covers it.

The actual tracking state lives in `MedicineDelivery`, a 1:1 sibling of
`MedicineOrder` created once the order is paid (see
`billing/payment_views.py`, which also makes the first assignment attempt).
`stage` only ever changes via an explicit courier action — `start-transit`
and `arrived` below — never from elapsed time.
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from delivery.assignment import haversine_km, retry_pending_assignments
from delivery.permissions import IsDeliveryPerson
from patient.permissions import IsPatient

from .models import (
    Branch, MedicineDelivery, MedicineOrder, MedicineOrderItem,
    Prescription, DELIVERY_STAGE_CHOICES, MAX_GEOFENCE_METERS,
)

# Flat shipping fee charged when shipping a doctor's prescription. Direct
# cart purchases ship free — the medicine price already includes it.
PRESCRIPTION_SHIPPING_FEE = Decimal('10.00')

# Ordered list of stage keys — used to report a stage index/total to the
# frontend's stepper UI.
STAGE_ORDER = [code for code, _ in DELIVERY_STAGE_CHOICES]

PROOF_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
PROOF_ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp'}


def _auto_assign_origin_branch():
    """Return the first active branch — used as the courier pickup point."""
    return Branch.objects.filter(is_active=True).order_by('pk').first()


class PrescriptionDeliveryCreateView(APIView):
    """Bundle all unclaimed prescribed medicines into a delivery order.

    Returns the order sid so the patient goes through the normal
    medicine-order payment flow (Stripe/PayPal) for the shipping fee only.
    The medicines themselves cost $0 because they're covered by the Rx.
    """
    permission_classes = [IsPatient]

    @transaction.atomic
    def post(self, request, sid):
        address = (request.data.get('address') or '').strip()
        if not address:
            return Response({'detail': 'address is required.'}, status=status.HTTP_400_BAD_REQUEST)
        # Set by the frontend's map/search address picker when the patient
        # confirms a point — see MedicineOrder.delivery_latitude/longitude.
        try:
            lat = float(request.data['latitude']) if request.data.get('latitude') not in (None, '') else None
            lng = float(request.data['longitude']) if request.data.get('longitude') not in (None, '') else None
        except (KeyError, ValueError, TypeError):
            lat = lng = None

        try:
            prescription = (
                Prescription.objects
                .select_related('medical_record__patient')
                .get(sid=sid, medical_record__patient=request.user.patient)
            )
        except Prescription.DoesNotExist:
            return Response({'detail': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Unclaimed, hospital-catalog items only. External-only items aren't
        # dispatched by us so we skip them silently.
        pending_items = list(
            prescription.items
            .filter(is_system_medication=True, medicine_order_item__isnull=True)
            .select_related('medication')
        )
        if not pending_items:
            return Response(
                {'detail': 'No pending prescribed medicines to deliver.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        origin = _auto_assign_origin_branch()
        if not origin:
            return Response(
                {'detail': 'No active branch available to ship from.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        order = MedicineOrder.objects.create(
            patient=request.user.patient,
            delivery_method='delivery',
            delivery_branch=origin,
            delivery_address=address,
            delivery_latitude=lat,
            delivery_longitude=lng,
            source_prescription=prescription,
            status='Pending Payment',
            shipping_fee=PRESCRIPTION_SHIPPING_FEE,
        )

        subtotal = Decimal('0')
        for item in pending_items:
            med = item.medication
            # Respect `free_when_prescribed`: most Rx meds are fully covered,
            # but if the catalog marks one as chargeable-even-with-Rx the
            # patient still pays for it on top of shipping.
            unit_price = Decimal('0') if med.free_when_prescribed else med.cost
            line_total = unit_price * 1
            MedicineOrderItem.objects.create(
                order=order,
                medication=med,
                quantity=1,
                unit_price=unit_price,
                total=line_total,
                source_prescription_item=item,
            )
            subtotal += line_total

        order.subtotal = subtotal
        order.total = subtotal + PRESCRIPTION_SHIPPING_FEE
        order.save(update_fields=['subtotal', 'total'])

        return Response(
            {
                'order_sid': order.sid,
                'total': str(order.total),
                'shipping_fee': str(order.shipping_fee),
                'item_count': len(pending_items),
                'origin_branch': origin.name,
                'address': address,
            },
            status=status.HTTP_201_CREATED,
        )


class PatientDeliveryListView(APIView):
    """List every delivery-mode medicine order belonging to this patient.

    Returns the courier-driven stage as stored — no more on-read simulation.
    """
    permission_classes = [IsPatient]

    def get(self, request):
        orders = (
            MedicineOrder.objects
            .filter(patient=request.user.patient, delivery_method='delivery')
            .select_related('delivery', 'delivery_branch')
            .prefetch_related('items__medication')
            .order_by('-created_at')
        )
        payload = []
        for order in orders:
            delivery = getattr(order, 'delivery', None)
            stage = delivery.stage if delivery else None
            payload.append({
                'order_sid': order.sid,
                'created_at': order.created_at.isoformat(),
                'status': order.status,
                'stage': stage,
                'stage_index': STAGE_ORDER.index(stage) if stage else None,
                'total_stages': len(STAGE_ORDER),
                'origin_branch': order.delivery_branch.name if order.delivery_branch else '',
                'address': order.delivery_address,
                'item_count': order.items.count(),
                'total': str(order.total),
                'shipping_fee': str(order.shipping_fee),
            })
        return Response(payload)


# Consider a courier's last GPS ping "stale" past this age — the frontend
# shows "last known location N min ago" instead of trusting a frozen pin.
LOCATION_STALE_SECONDS = 60


class MedicineDeliveryTrackingView(APIView):
    """Polling endpoint. Stage only moves via the courier's own actions
    (start-transit / arrived, below) — this view just reports current state,
    plus the courier's live position once they're on the way.
    """
    permission_classes = [IsPatient]

    def get(self, request, sid):
        try:
            order = (
                MedicineOrder.objects
                .select_related('delivery', 'delivery__courier', 'delivery_branch', 'patient')
                .prefetch_related('items__medication')
                .get(sid=sid, patient=request.user.patient)
            )
        except MedicineOrder.DoesNotExist:
            return Response({'detail': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            delivery = order.delivery
        except MedicineDelivery.DoesNotExist:
            return Response(
                {'detail': 'This order has no delivery record yet.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        courier_lat = courier_lng = courier_location_updated_at = None
        courier_location_stale = False
        # Only surface the courier's position once they're actually moving —
        # before that there's nothing useful to show on a map yet.
        if delivery.stage == 'on_the_way' and delivery.courier:
            courier_lat = delivery.courier.current_latitude
            courier_lng = delivery.courier.current_longitude
            courier_location_updated_at = delivery.courier.location_updated_at
            if courier_location_updated_at:
                age = (timezone.now() - courier_location_updated_at).total_seconds()
                courier_location_stale = age > LOCATION_STALE_SECONDS

        return Response({
            'order_sid': order.sid,
            'stage': delivery.stage,
            'stage_index': STAGE_ORDER.index(delivery.stage),
            'total_stages': len(STAGE_ORDER),
            'started_at': delivery.started_at.isoformat() if delivery.started_at else None,
            'delivered_at': delivery.delivered_at.isoformat() if delivery.delivered_at else None,
            'origin_branch': delivery.origin_branch.name if delivery.origin_branch else '',
            'address': delivery.address,
            'shipping_fee': str(order.shipping_fee),
            'total': str(order.total),
            'courier_lat': courier_lat,
            'courier_lng': courier_lng,
            'courier_location_updated_at': courier_location_updated_at.isoformat() if courier_location_updated_at else None,
            'courier_location_stale': courier_location_stale,
            'dest_lat': delivery.dest_latitude,
            'dest_lng': delivery.dest_longitude,
            'items': [
                {
                    'sid': item.sid,
                    'name': item.medication.name,
                    'dosage_form': item.medication.dosage_form,
                    'strength': item.medication.strength,
                    'quantity': item.quantity,
                    'unit_price': str(item.unit_price),
                    'total': str(item.total),
                }
                for item in order.items.all()
            ],
        })


class DeliveryStartTransitView(APIView):
    """The assigned courier taps "On my way" — picked_up -> on_the_way. This
    is also the moment the patient's tracker starts showing a live map."""
    permission_classes = [IsDeliveryPerson]

    def post(self, request, sid):
        try:
            delivery = MedicineDelivery.objects.get(sid=sid, courier=request.user.delivery_person)
        except MedicineDelivery.DoesNotExist:
            return Response({'detail': 'Delivery not found.'}, status=status.HTTP_404_NOT_FOUND)
        if delivery.stage != 'picked_up':
            return Response({'detail': f'Cannot start transit from stage "{delivery.stage}".'}, status=status.HTTP_400_BAD_REQUEST)
        delivery.stage = 'on_the_way'
        delivery.save(update_fields=['stage'])
        return Response({'stage': delivery.stage})


class DeliveryArrivedView(APIView):
    """The assigned courier taps "Arrived" — on_the_way -> delivered.
    Requires a proof photo; the courier's current GPS position is checked
    against the confirmed delivery point and BLOCKS the confirmation if
    they're clearly too far away (explicit product decision — a courier who
    really is there can always just walk closer and retry). Only blocks on a
    definite "too far" reading — if there's no destination coordinate to
    check against at all, it's let through rather than stranding the
    delivery on a technicality.
    """
    permission_classes = [IsDeliveryPerson]
    parser_classes = [MultiPartParser]

    @transaction.atomic
    def post(self, request, sid):
        try:
            delivery = MedicineDelivery.objects.select_related('order').get(
                sid=sid, courier=request.user.delivery_person,
            )
        except MedicineDelivery.DoesNotExist:
            return Response({'detail': 'Delivery not found.'}, status=status.HTTP_404_NOT_FOUND)
        if delivery.stage != 'on_the_way':
            return Response({'detail': f'Cannot mark arrived from stage "{delivery.stage}".'}, status=status.HTTP_400_BAD_REQUEST)

        photo = request.FILES.get('photo')
        if not photo:
            return Response({'detail': 'A delivery photo is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if photo.content_type not in PROOF_ALLOWED_TYPES:
            return Response({'detail': 'Unsupported file type. Allowed: JPEG, PNG, WebP.'}, status=status.HTTP_400_BAD_REQUEST)
        if photo.size > PROOF_MAX_BYTES:
            return Response({'detail': 'File is too large (max 10 MB).'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            lat = float(request.data['latitude'])
            lng = float(request.data['longitude'])
        except (KeyError, ValueError):
            return Response({'detail': 'latitude and longitude are required.'}, status=status.HTTP_400_BAD_REQUEST)

        within_geofence = None
        if delivery.dest_latitude is not None and delivery.dest_longitude is not None:
            distance_m = haversine_km(lat, lng, delivery.dest_latitude, delivery.dest_longitude) * 1000
            within_geofence = distance_m <= MAX_GEOFENCE_METERS
            if not within_geofence:
                return Response(
                    {
                        'detail': f"You're about {distance_m / 1000:.1f} km from the delivery address — "
                                  f'get within {MAX_GEOFENCE_METERS}m to confirm arrival.',
                        'distance_m': round(distance_m),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        delivery.stage = 'delivered'
        delivery.delivered_at = timezone.now()
        delivery.proof_photo = photo
        delivery.proof_latitude = lat
        delivery.proof_longitude = lng
        delivery.save(update_fields=['stage', 'delivered_at', 'proof_photo', 'proof_latitude', 'proof_longitude'])

        order = delivery.order
        if not delivery.delivered_email_sent:
            try:
                from userauths.services.email_service import send_medicine_delivery_completed_email
                send_medicine_delivery_completed_email(order)
            except Exception:
                pass
            finally:
                delivery.delivered_email_sent = True
                delivery.save(update_fields=['delivered_email_sent'])

        # This courier just freed up — see if anything in the pending queue
        # can be placed now.
        transaction.on_commit(retry_pending_assignments)

        return Response({'stage': delivery.stage, 'within_geofence': within_geofence})
