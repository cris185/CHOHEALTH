import shortuuid
from django.conf import settings
from django.db import models


# ============================================================================
# DeliveryPerson (courier profile, one per User with user_type='Delivery')
# ============================================================================

ON_DUTY_STATUS_CHOICES = (
    ('off_duty', 'Off duty'),
    ('on_duty', 'On duty'),
    ('on_break', 'On break'),
)


class DeliveryPerson(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='delivery_person',
    )
    image = models.FileField(upload_to='delivery_person_images', default='default/default-user.jpg', blank=True)
    first_name = models.CharField(max_length=100)
    second_name = models.CharField(max_length=100, blank=True)
    first_last_name = models.CharField(max_length=100)
    second_last_name = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)

    on_duty_status = models.CharField(max_length=10, choices=ON_DUTY_STATUS_CHOICES, default='off_duty')
    # Denormalized so the assignment algorithm can rank candidates without
    # joining to DeliveryShift/DeliveryBreak on every lookup.
    current_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    current_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_updated_at = models.DateTimeField(null=True, blank=True)

    expo_push_token = models.CharField(max_length=200, blank=True)

    # Required at registration — the courier accepted the GPS-tracking
    # consent checkbox. Never null: a DeliveryPerson can't exist without it.
    gps_consent_accepted_at = models.DateTimeField()

    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def full_name(self):
        parts = [self.first_name, self.second_name, self.first_last_name, self.second_last_name]
        return ' '.join(p for p in parts if p)

    @property
    def has_active_delivery(self):
        return self.deliveries.exclude(stage='delivered').exists()

    def __str__(self):
        return f'{self.full_name} ({self.on_duty_status})'


# ============================================================================
# Clock-in/out shifts and breaks
# ============================================================================

class DeliveryShift(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    delivery_person = models.ForeignKey(DeliveryPerson, on_delete=models.CASCADE, related_name='shifts')
    clock_in_at = models.DateTimeField(auto_now_add=True)
    # Null means the shift is still active (the courier hasn't clocked out).
    clock_out_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-clock_in_at']

    def __str__(self):
        return f'Shift {self.sid[:6]} — {self.delivery_person.full_name}'


class DeliveryBreak(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    shift = models.ForeignKey(DeliveryShift, on_delete=models.CASCADE, related_name='breaks')
    started_at = models.DateTimeField(auto_now_add=True)
    # Null means the break is still active.
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f'Break {self.sid[:6]} on shift {self.shift.sid[:6]}'


# ============================================================================
# DeliveryOffer (audit trail for the proximity-ranked offer/decline cascade)
# ============================================================================

OFFER_STATUS_CHOICES = (
    ('pending', 'Pending'),
    ('accepted', 'Accepted'),
    ('declined', 'Declined'),
    ('expired', 'Expired'),
)


class DeliveryOffer(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    delivery = models.ForeignKey('base.MedicineDelivery', on_delete=models.CASCADE, related_name='offers')
    delivery_person = models.ForeignKey(DeliveryPerson, on_delete=models.CASCADE, related_name='offers')
    status = models.CharField(max_length=10, choices=OFFER_STATUS_CHOICES, default='pending')
    offered_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ['-offered_at']

    def __str__(self):
        return f'Offer {self.sid[:6]} — {self.delivery_person.full_name} ({self.status})'
