from rest_framework import serializers
from .models import Doctor, DoctorQualification, DoctorSchedule, Notification


class DoctorQualificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorQualification
        fields = ('sid', 'degree', 'institution', 'year', 'certificate')
        read_only_fields = ('sid',)


class DoctorQualificationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorQualification
        fields = ('degree', 'institution', 'year', 'certificate')


class DoctorScheduleSerializer(serializers.ModelSerializer):
    day_name = serializers.CharField(source='get_day_of_week_display', read_only=True)

    class Meta:
        model = DoctorSchedule
        fields = ('day_of_week', 'day_name', 'start_time', 'end_time', 'break_start', 'break_end')


class DoctorProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    full_name = serializers.CharField(read_only=True)
    qualifications = DoctorQualificationSerializer(many=True, read_only=True)

    class Meta:
        model = Doctor
        fields = (
            'sid', 'email', 'full_name',
            'image', 'first_name', 'second_name', 'first_last_name', 'second_last_name',
            'mobile', 'country', 'bio',
            'specialization', 'years_of_experience',
            'qualifications',
        )
        read_only_fields = ('sid', 'email', 'full_name', 'qualifications')


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ('sid', 'type', 'title', 'message', 'is_read', 'created_at', 'appointment')
