import shortuuid
from django.db import models
from django.conf import settings


GENDER_CHOICES = (
    ('Male', 'Male'),
    ('Female', 'Female'),
    ('Other', 'Other'),
)

BLOOD_GROUP_CHOICES = (
    ('A+', 'A+'),
    ('A-', 'A-'),
    ('B+', 'B+'),
    ('B-', 'B-'),
    ('O+', 'O+'),
    ('O-', 'O-'),
    ('AB+', 'AB+'),
    ('AB-', 'AB-'),
)


class Patient(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='patient',
    )
    first_name = models.CharField(max_length=100)
    second_name = models.CharField(max_length=100, blank=True)
    first_last_name = models.CharField(max_length=100)
    second_last_name = models.CharField(max_length=100, blank=True)
    image = models.FileField(upload_to='patient_images', default='default/default-user.jpg', blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=300, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES, blank=True)
    blood_group = models.CharField(max_length=5, choices=BLOOD_GROUP_CHOICES, blank=True)

    @property
    def full_name(self):
        parts = [self.first_name, self.second_name, self.first_last_name, self.second_last_name]
        return ' '.join(p for p in parts if p)

    def __str__(self):
        return self.full_name or self.user.email
