from rest_framework import serializers
from .models import Patient
from doctor.models import Notification


class PatientProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Patient
        fields = (
            'sid', 'email', 'full_name',
            'image', 'first_name', 'second_name', 'first_last_name', 'second_last_name',
            'phone', 'address', 'date_of_birth', 'gender', 'blood_group',
        )
        read_only_fields = ('sid', 'email', 'full_name')


class PatientNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ('sid', 'type', 'title', 'message', 'is_read', 'created_at', 'appointment')
