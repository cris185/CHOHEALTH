import shortuuid
from django.db import models
from django.conf import settings


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
    qualification = models.CharField(max_length=300)
    years_of_experience = models.PositiveIntegerField(default=0)
    next_available_appointment_date = models.DateTimeField(null=True, blank=True)

    @property
    def full_name(self):
        parts = [self.first_name, self.second_name, self.first_last_name, self.second_last_name]
        return ' '.join(p for p in parts if p)

    def __str__(self):
        return f'Dr. {self.first_name} {self.first_last_name} - {self.specialization}'


NOTIFICATION_TYPE = (
    ('New Appointment', 'New Appointment'),
    ('Appointment Cancelled', 'Appointment Cancelled'),
    ('Appointment Rescheduled', 'Appointment Rescheduled'),
)


class Notification(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='notifications')
    patient = models.ForeignKey('patient.Patient', on_delete=models.CASCADE, related_name='notifications')
    type = models.CharField(max_length=50, choices=NOTIFICATION_TYPE)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.type} - Dr. {self.doctor.first_name} {self.doctor.first_last_name}'
