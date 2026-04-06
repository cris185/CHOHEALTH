from rest_framework import serializers
from .models import Doctor, DoctorSchedule, Notification


class DoctorScheduleSerializer(serializers.ModelSerializer):
    day_name = serializers.CharField(source='get_day_of_week_display', read_only=True)

    class Meta:
        model = DoctorSchedule
        fields = ('day_of_week', 'day_name', 'shift_type', 'start_time', 'end_time', 'break_start', 'break_end')


class DoctorProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Doctor
        fields = (
            'sid', 'email', 'full_name',
            'image', 'first_name', 'second_name', 'first_last_name', 'second_last_name',
            'mobile', 'country', 'bio',
            'specialization', 'qualification', 'years_of_experience',
        )
        read_only_fields = ('sid', 'email', 'full_name')


class NotificationSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ('sid', 'type', 'message', 'is_read', 'created_at', 'patient_name')

    def get_patient_name(self, obj):
        return obj.patient.full_name if obj.patient else None
