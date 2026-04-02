import shortuuid
from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('El email es obligatorio')
        email = self.normalize_email(email)
        if not extra_fields.get('username'):
            extra_fields['username'] = self._generate_username(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('user_type', 'Superuser')
        return self.create_user(email, password, **extra_fields)

    def _generate_username(self, email):
        base = email.split('@')[0]
        username = base
        counter = 1
        while self.model.objects.filter(username=username).exists():
            username = f'{base}{counter}'
            counter += 1
        return username


USER_TYPE = (
    ('Patient', 'Patient'),
    ('Doctor', 'Doctor'),
    ('Superuser', 'Superuser'),
)


class User(AbstractUser):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=100, blank=True)
    user_type = models.CharField(max_length=20, choices=USER_TYPE, default='Patient')
    otp = models.CharField(max_length=100, null=True, blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    objects = UserManager()

    def save(self, *args, **kwargs):
        if not self.username and self.email:
            base = self.email.split('@')[0]
            username = base
            counter = 1
            while User.objects.filter(username=username).exclude(pk=self.pk).exists():
                username = f'{base}{counter}'
                counter += 1
            self.username = username
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email
