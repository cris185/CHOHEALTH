import shortuuid
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError


class Doctor(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='doctor',
    )
    image = models.FileField(upload_to='doctor_images', default='default/default-user.jpg', blank=True)
    first_name = models.CharField(max_length=100)
    second_name = models.CharField(max_length=100, blank=True)
    first_last_name = models.CharField(max_length=100)
    second_last_name = models.CharField(max_length=100, blank=True)
    mobile = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, blank=True)
    bio = models.TextField(blank=True)
    specialization = models.CharField(max_length=200)
    years_of_experience = models.PositiveIntegerField(default=0)

    # Denormalized rating aggregates. Kept in sync by a post_save / post_delete
    # signal on `base.Review` so the doctor listing (a hot query) doesn't have
    # to compute an AVG on every request.
    average_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    total_reviews = models.PositiveIntegerField(default=0)

    def recalculate_rating(self):
        from base.models import Review
        from django.db.models import Avg, Count
        agg = Review.objects.filter(doctor=self).aggregate(
            avg=Avg('rating'), total=Count('id'),
        )
        self.average_rating = round(agg['avg'] or 0, 2)
        self.total_reviews = agg['total'] or 0
        self.save(update_fields=['average_rating', 'total_reviews'])

    @property
    def full_name(self):
        parts = [self.first_name, self.second_name, self.first_last_name, self.second_last_name]
        return ' '.join(p for p in parts if p)

    def __str__(self):
        return f'Dr. {self.first_name} {self.first_last_name} - {self.specialization}'


# ============================================================================
# Doctor Qualifications (structured, multiple per doctor)
# ============================================================================

class DoctorQualification(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='qualifications')
    degree = models.CharField(max_length=200)
    institution = models.CharField(max_length=300)
    year = models.PositiveIntegerField(null=True, blank=True)
    certificate = models.FileField(upload_to='doctor_certificates', blank=True)

    class Meta:
        ordering = ['-year']

    def __str__(self):
        return f'{self.degree} - {self.institution} ({self.year})'


# ============================================================================
# Doctor Schedule (flexible, multiple blocks per day)
# ============================================================================

DAY_OF_WEEK = (
    (0, 'Monday'),
    (1, 'Tuesday'),
    (2, 'Wednesday'),
    (3, 'Thursday'),
    (4, 'Friday'),
    (5, 'Saturday'),
    (6, 'Sunday'),
)


class DoctorSchedule(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='schedules')
    day_of_week = models.IntegerField(choices=DAY_OF_WEEK)
    start_time = models.TimeField()
    end_time = models.TimeField()
    break_start = models.TimeField(null=True, blank=True)
    break_end = models.TimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['day_of_week', 'start_time']

    def clean(self):
        if self.start_time >= self.end_time:
            raise ValidationError('Start time must be before end time.')
        if self.break_start and self.break_end:
            if self.break_start >= self.break_end:
                raise ValidationError('Break start must be before break end.')
            if self.break_start < self.start_time or self.break_end > self.end_time:
                raise ValidationError('Break must be within working hours.')

    def __str__(self):
        return f'Dr. {self.doctor.first_name} {self.doctor.first_last_name} - {self.get_day_of_week_display()} {self.start_time}-{self.end_time}'


# ============================================================================
# Notification (generic, recipient-based)
# ============================================================================

NOTIFICATION_TYPE = (
    ('New Appointment', 'New Appointment'),
    ('Appointment Confirmed', 'Appointment Confirmed'),
    ('Appointment Cancelled', 'Appointment Cancelled'),
    ('Appointment Completed', 'Appointment Completed'),
    ('Appointment Rescheduled', 'Appointment Rescheduled'),
    ('Payment Received', 'Payment Received'),
    ('Lab Results Ready', 'Lab Results Ready'),
    ('Medical Record Available', 'Medical Record Available'),
    ('Prescription Ready', 'Prescription Ready'),
    ('Lab Order Created', 'Lab Order Created'),
    ('Medication Ready for Pickup', 'Medication Ready for Pickup'),
    ('Medication Dispatched', 'Medication Dispatched'),
    ('Medication Delivered', 'Medication Delivered'),
    ('Rate Doctor', 'Rate Doctor'),
)


class Notification(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    type = models.CharField(max_length=50, choices=NOTIFICATION_TYPE)
    title = models.CharField(max_length=200)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    appointment = models.ForeignKey('base.Appointment', on_delete=models.SET_NULL, null=True, blank=True, related_name='notifications')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.type} - {self.recipient.email}'
