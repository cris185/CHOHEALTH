"""Delivery assignment: proximity-ranked offer, one candidate at a time,
cascading to the next-closest on decline or timeout.

No cron anywhere here — every entry point is triggered by a real event
(a delivery being created, a courier declining/timing out an offer, or a
courier freeing up by marking a delivery as arrived). A courier's own app
counts down the offer locally and calls /decline/ when it hits zero; as a
fallback (app killed, connection lost), `expire_stale_offers` lazily treats
any offer past `expires_at` as expired the next time it's read or acted on.

v1 simplification: only fully idle couriers (no active delivery at all) are
candidates — one delivery at a time per courier, no "about to finish"
secondary tier, since there's no longer a distinct "almost there" stage to
key off (see base.models.DELIVERY_STAGE_CHOICES). A busy courier becomes a
candidate again the moment their current delivery reaches `delivered`,
which already re-triggers assignment for the pending queue.
"""
import math
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import DeliveryPerson, DeliveryOffer

OFFER_TIMEOUT_SECONDS = 45


def haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    phi1, phi2 = math.radians(float(lat1)), math.radians(float(lat2))
    dphi = math.radians(float(lat2) - float(lat1))
    dlambda = math.radians(float(lng2) - float(lng1))
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _candidates_ranked_by_distance(delivery, origin_lat, origin_lng):
    """On-duty, idle couriers with no pending offer and no prior response to
    THIS delivery (declined/expired), closest first. Couriers without a
    known GPS fix yet are still eligible, just sorted last."""
    qs = (
        DeliveryPerson.objects.filter(on_duty_status='on_duty')
        .exclude(deliveries__stage__in=['picked_up', 'on_the_way'])
        .exclude(offers__status='pending')  # busy responding to something else
        .exclude(offers__delivery=delivery)  # already offered this one — don't re-offer after a decline/expiry
        .distinct()
    )
    with_loc, without_loc = [], []
    for dp in qs:
        if dp.current_latitude is not None and dp.current_longitude is not None:
            with_loc.append(dp)
        else:
            without_loc.append(dp)
    if origin_lat is not None and origin_lng is not None:
        with_loc.sort(key=lambda dp: haversine_km(origin_lat, origin_lng, dp.current_latitude, dp.current_longitude))
    return with_loc + without_loc


def try_assign(delivery):
    """Offer `delivery` to the closest available courier. No-op if it
    already has a courier or an outstanding pending offer.
    """
    with transaction.atomic():
        delivery.refresh_from_db()
        if delivery.courier_id or delivery.offers.filter(status='pending').exists():
            return None

        origin = delivery.origin_branch
        origin_lat = origin.latitude if origin else None
        origin_lng = origin.longitude if origin else None

        for dp in _candidates_ranked_by_distance(delivery, origin_lat, origin_lng):
            locked = DeliveryPerson.objects.select_for_update().get(pk=dp.pk)
            if locked.on_duty_status != 'on_duty' or locked.has_active_delivery:
                continue
            if locked.offers.filter(status='pending').exists():
                continue
            offer = DeliveryOffer.objects.create(
                delivery=delivery,
                delivery_person=locked,
                expires_at=timezone.now() + timedelta(seconds=OFFER_TIMEOUT_SECONDS),
            )
            _notify_offer(offer)
            return offer

    return None


def _notify_offer(offer):
    # Expo push wiring lands in the mobile-app phase — for now this just
    # gets the offer into the in-app notification feed.
    from doctor.models import Notification
    Notification.objects.create(
        recipient=offer.delivery_person.user,
        type='New Delivery Offer',
        title='New Delivery Offer',
        message=f'A new delivery is available near you. You have {OFFER_TIMEOUT_SECONDS}s to respond.',
        delivery=offer.delivery,
    )


def expire_stale_offers(delivery_person=None):
    """Lazily settle overdue pending offers. Call this before reading or
    acting on offers for a given courier (or globally with no argument)."""
    qs = DeliveryOffer.objects.filter(status='pending', expires_at__lt=timezone.now())
    if delivery_person is not None:
        qs = qs.filter(delivery_person=delivery_person)
    for offer in list(qs):
        offer.status = 'expired'
        offer.responded_at = timezone.now()
        offer.save(update_fields=['status', 'responded_at'])
        try_assign(offer.delivery)


def accept_offer(offer):
    """Returns True if accepted, False if it had already expired/been
    resolved by something else (race with the timeout or a decline)."""
    with transaction.atomic():
        offer = DeliveryOffer.objects.select_for_update().get(pk=offer.pk)
        if offer.status != 'pending':
            return False
        if offer.expires_at < timezone.now():
            offer.status = 'expired'
            offer.responded_at = timezone.now()
            offer.save(update_fields=['status', 'responded_at'])
            return False
        offer.status = 'accepted'
        offer.responded_at = timezone.now()
        offer.save(update_fields=['status', 'responded_at'])
        delivery = offer.delivery
        delivery.courier = offer.delivery_person
        delivery.save(update_fields=['courier'])
    return True


def decline_offer(offer):
    offer.status = 'declined'
    offer.responded_at = timezone.now()
    offer.save(update_fields=['status', 'responded_at'])
    try_assign(offer.delivery)


def retry_pending_assignments():
    """Sweep every unassigned delivery and try to place it — called when a
    courier frees up (marks a delivery `delivered`), since that could unblock
    any delivery in the queue, not just the one they were just carrying."""
    from base.models import MedicineDelivery
    pending = (
        MedicineDelivery.objects
        .filter(courier__isnull=True, stage='picked_up')
        .exclude(offers__status='pending')
    )
    for delivery in pending:
        try_assign(delivery)
