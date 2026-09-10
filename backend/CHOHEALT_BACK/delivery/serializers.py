from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from userauths.models import User
from userauths.serializers import _BaseRegisterSerializer

from .models import DeliveryPerson


class DeliveryPersonRegisterSerializer(_BaseRegisterSerializer):
    phone = serializers.CharField(max_length=20, required=False, default='', allow_blank=True)
    # Must be explicitly true — this is the GPS-tracking consent checkbox,
    # not just a "did they submit the field" check.
    gps_consent = serializers.BooleanField()

    def validate_gps_consent(self, value):
        if not value:
            raise serializers.ValidationError(
                'Debes aceptar el uso de tu ubicación GPS para registrarte como repartidor.'
            )
        return value

    @transaction.atomic
    def create(self, validated_data):
        user = User.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password'],
            user_type='Delivery',
        )
        DeliveryPerson.objects.create(
            user=user,
            first_name=validated_data['first_name'],
            second_name=validated_data.get('second_name', ''),
            first_last_name=validated_data['first_last_name'],
            second_last_name=validated_data.get('second_last_name', ''),
            phone=validated_data.get('phone', ''),
            gps_consent_accepted_at=timezone.now(),
        )
        return user


class DeliveryPersonProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = DeliveryPerson
        fields = (
            'sid', 'email', 'full_name',
            'image', 'first_name', 'second_name', 'first_last_name', 'second_last_name',
            'phone', 'on_duty_status', 'expo_push_token',
        )
        read_only_fields = ('sid', 'email', 'full_name', 'on_duty_status')
