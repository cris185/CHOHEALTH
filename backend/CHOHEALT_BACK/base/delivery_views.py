"""Endpoints for the medicine delivery flow.

Two entry points create a MedicineOrder destined for delivery:
  1) `PrescriptionDeliveryCreateView` — bundles all unclaimed prescribed
     medicines into a single order. Shipping fee applies ($10).
  2) `MedicineOrderCreateView` (in medical_views) — already supports
     `delivery_method='delivery'` for direct cart purchases. Shipping is free
     because the medicine price already covers it.

The actual tracking state lives in `MedicineDelivery`, a 1:1 sibling of
`MedicineOrder` created once the order is paid. Stage advancement is computed
from elapsed time on read (see `_compute_current_stage`) — no cron needed.
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from patient.permissions import IsPatient

from .models import (
    Branch, MedicineDelivery, MedicineOrder, MedicineOrderItem,
    Prescription, DELIVERY_STAGE_CHOICES, DELIVERY_STAGE_SECONDS,
)

# Flat shipping fee charged when shipping a doctor's prescription. Direct
# cart purchases ship free — the medicine price already includes it.
PRESCRIPTION_SHIPPING_FEE = Decimal('10.00')

# Ordered list of stage keys — used to compute the active stage by index and
# to figure out when we've reached "delivered".
STAGE_ORDER = [code for code, _ in DELIVERY_STAGE_CHOICES]


def _auto_assign_origin_branch():
    """Return the first active branch — used as the courier pickup point."""
    return Branch.objects.filter(is_active=True).order_by('pk').first()


def _compute_current_stage(delivery: MedicineDelivery) -> str:
    """How many stage-ticks have elapsed since the order was paid.

    Deterministic function of `started_at` so the polling endpoint doesn't
    need to persist anything to move the tracker forward — only when we
    transition INTO `delivered` do we write back (to trigger the email).
    """
    if not delivery.started_at:
        return STAGE_ORDER[0]
    elapsed = (timezone.now() - delivery.started_at).total_seconds()
    idx = min(int(elapsed // DELIVERY_STAGE_SECONDS), len(STAGE_ORDER) - 1)
    return STAGE_ORDER[idx]


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

    Returns the current (possibly auto-advanced) stage so the list page can
    show an inline progress badge without hitting the per-order tracker.
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
            stage = _compute_current_stage(delivery) if delivery else None
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


class MedicineDeliveryTrackingView(APIView):
    """Polling endpoint. Returns the active delivery stage, advancing it if
    the elapsed time crossed a stage boundary, and fires the delivered email
    the first time we hit the final stage.
    """
    permission_classes = [IsPatient]

    def get(self, request, sid):
        try:
            order = (
                MedicineOrder.objects
                .select_related('delivery', 'delivery_branch', 'patient')
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

        new_stage = _compute_current_stage(delivery)

        # Transition bookkeeping. Only write to the DB when the computed stage
        # overtakes the stored one — otherwise every poll would be a write.
        if new_stage != delivery.stage:
            delivery.stage = new_stage
            if new_stage == 'delivered' and not delivery.delivered_at:
                delivery.delivered_at = timezone.now()
            delivery.save(update_fields=['stage', 'delivered_at'])

        # First-time-delivered: fire the email.
        if (
            delivery.stage == 'delivered'
            and not delivery.delivered_email_sent
        ):
            try:
                from userauths.services.email_service import send_medicine_delivery_completed_email
                send_medicine_delivery_completed_email(order)
            except Exception:
                pass
            finally:
                delivery.delivered_email_sent = True
                delivery.save(update_fields=['delivered_email_sent'])

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
