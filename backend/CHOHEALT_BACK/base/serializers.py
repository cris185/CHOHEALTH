from datetime import datetime, timedelta
from django.conf import settings
from django.utils import timezone
from rest_framework import serializers
from .models import Service, Appointment, Branch
from doctor.models import Doctor, DoctorSchedule, DoctorQualification
import zoneinfo


class DoctorQualificationBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorQualification
        fields = ('degree', 'institution', 'year')


class ServiceDoctorSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    image = serializers.FileField(read_only=True)
    qualifications = DoctorQualificationBriefSerializer(many=True, read_only=True)

    class Meta:
        model = Doctor
        fields = ('sid', 'full_name', 'image', 'specialization', 'qualifications', 'years_of_experience', 'bio')


class ServiceListSerializer(serializers.ModelSerializer):
    doctors = ServiceDoctorSerializer(many=True, read_only=True)
    doctors_count = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = ('sid', 'name', 'description', 'image', 'cost', 'duration_minutes', 'service_type', 'doctors', 'doctors_count')

    def get_doctors_count(self, obj):
        return obj.doctors.count()


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ('sid', 'name', 'address', 'phone')


class AppointmentCreateSerializer(serializers.Serializer):
    doctor_sid = serializers.CharField(required=False, allow_blank=True, default='')
    service_sid = serializers.CharField()
    date = serializers.DateTimeField()
    mode = serializers.ChoiceField(choices=[('In-Person', 'In-Person'), ('Virtual', 'Virtual')])
    branch_sid = serializers.CharField(required=False, allow_blank=True, default='')
    issues = serializers.CharField(required=False, allow_blank=True, default='')
    symptoms = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, data):
        try:
            service = Service.objects.get(sid=data['service_sid'])
        except Service.DoesNotExist:
            raise serializers.ValidationError({'service_sid': 'Service not found.'})

        doctor = None
        if data.get('doctor_sid'):
            try:
                doctor = Doctor.objects.get(sid=data['doctor_sid'])
            except Doctor.DoesNotExist:
                raise serializers.ValidationError({'doctor_sid': 'Doctor not found.'})

            if not service.doctors.filter(pk=doctor.pk).exists():
                raise serializers.ValidationError('This doctor does not offer this service.')

        # Consultation services require a doctor
        if service.service_type == 'Consultation' and not doctor:
            raise serializers.ValidationError({'doctor_sid': 'Consultation services require a doctor.'})

        appt_date = data['date']
        if appt_date <= timezone.now():
            raise serializers.ValidationError({'date': 'Appointment date must be in the future.'})

        # Schedule validation only for consultation with doctor
        if doctor and service.service_type == 'Consultation':
            tz = zoneinfo.ZoneInfo(settings.TIME_ZONE)
            local_date = appt_date.astimezone(tz)
            day_of_week = local_date.weekday()
            appt_time = local_date.time()

            schedule = DoctorSchedule.objects.filter(
                doctor=doctor, day_of_week=day_of_week, is_active=True,
                start_time__lte=appt_time, end_time__gt=appt_time,
            ).first()

            if not schedule:
                raise serializers.ValidationError({'date': 'Doctor is not available at this time.'})

            # Break check
            if schedule.break_start and schedule.break_end:
                slot_end_time = (datetime.combine(local_date.date(), appt_time) + timedelta(minutes=service.duration_minutes)).time()
                if appt_time < schedule.break_end and slot_end_time > schedule.break_start:
                    raise serializers.ValidationError({'date': 'This time slot falls within the break period.'})

            # Overlap check
            duration = timedelta(minutes=service.duration_minutes)
            slot_end = appt_date + duration

            conflicts = Appointment.objects.filter(
                doctor=doctor,
                status__in=['Confirmed', 'In Progress'],
            ).select_related('service')

            for appt in conflicts:
                appt_duration = appt.service.duration_minutes if appt.service else 30
                existing_end = appt.date + timedelta(minutes=appt_duration)
                if appt_date < existing_end and slot_end > appt.date:
                    raise serializers.ValidationError({'date': 'This time slot is already booked.'})

        # Branch validation
        branch = None
        if data['mode'] == 'In-Person' and data.get('branch_sid'):
            try:
                branch = Branch.objects.get(sid=data['branch_sid'], is_active=True)
            except Branch.DoesNotExist:
                raise serializers.ValidationError({'branch_sid': 'Branch not found.'})

        data['_doctor'] = doctor
        data['_service'] = service
        data['_branch'] = branch
        return data

    def create(self, validated_data):
        patient = self.context['request'].user.patient
        appointment = Appointment.objects.create(
            patient=patient,
            doctor=validated_data['_doctor'],
            service=validated_data['_service'],
            date=validated_data['date'],
            mode=validated_data['mode'],
            branch=validated_data.get('_branch'),
            issues=validated_data.get('issues', ''),
            symptoms=validated_data.get('symptoms', ''),
            notes=validated_data.get('notes', ''),
            status='Unpaid',
        )
        return appointment


class AppointmentListSerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()
    doctor_sid = serializers.SerializerMethodField()
    service_name = serializers.SerializerMethodField()
    service_sid = serializers.SerializerMethodField()
    service_cost = serializers.SerializerMethodField()
    service_duration = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()
    invoice_status = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = (
            'sid', 'date', 'status', 'mode',
            'doctor_name', 'doctor_sid',
            'service_name', 'service_sid', 'service_cost', 'service_duration',
            'branch_name',
            'issues', 'symptoms', 'notes',
            'invoice_status',
            'cancelled_at', 'cancelled_by', 'cancel_reason',
            'rescheduled_from', 'reschedule_count',
            'created_at',
        )

    def get_doctor_name(self, obj):
        if obj.doctor:
            return f'Dr. {obj.doctor.first_name} {obj.doctor.first_last_name}'
        return 'Lab Service'

    def get_doctor_sid(self, obj):
        return obj.doctor.sid if obj.doctor else None

    def get_service_name(self, obj):
        return obj.service.name if obj.service else None

    def get_service_sid(self, obj):
        return obj.service.sid if obj.service else None

    def get_service_cost(self, obj):
        return str(obj.service.cost) if obj.service else '0'

    def get_service_duration(self, obj):
        return obj.service.duration_minutes if obj.service else 30

    def get_branch_name(self, obj):
        return obj.branch.name if obj.branch else None

    def get_invoice_status(self, obj):
        try:
            return obj.invoice.status
        except Exception:
            return None


class DoctorAppointmentListSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_image = serializers.SerializerMethodField()
    service_name = serializers.SerializerMethodField()
    service_duration = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = (
            'sid', 'date', 'status', 'mode',
            'patient_name', 'patient_image',
            'service_name', 'service_duration',
            'branch_name', 'issues', 'symptoms', 'notes', 'created_at',
        )

    def get_patient_name(self, obj):
        return obj.patient.full_name

    def get_patient_image(self, obj):
        if obj.patient.image and hasattr(obj.patient.image, 'url'):
            return obj.patient.image.url
        return None

    def get_service_name(self, obj):
        return obj.service.name if obj.service else None

    def get_service_duration(self, obj):
        return obj.service.duration_minutes if obj.service else 30

    def get_branch_name(self, obj):
        return obj.branch.name if obj.branch else None


class DoctorAppointmentDetailSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_image = serializers.SerializerMethodField()
    patient_email = serializers.SerializerMethodField()
    patient_phone = serializers.SerializerMethodField()
    patient_date_of_birth = serializers.SerializerMethodField()
    patient_gender = serializers.SerializerMethodField()
    patient_blood_group = serializers.SerializerMethodField()
    service_name = serializers.SerializerMethodField()
    service_sid = serializers.SerializerMethodField()
    service_duration = serializers.SerializerMethodField()
    doctor_sid = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()
    invoice_status = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = (
            'sid', 'date', 'status', 'mode',
            'patient_name', 'patient_image', 'patient_email',
            'patient_phone', 'patient_date_of_birth', 'patient_gender', 'patient_blood_group',
            'doctor_sid',
            'service_name', 'service_sid', 'service_duration',
            'branch_name', 'room', 'meeting_link',
            'issues', 'symptoms', 'notes',
            'invoice_status',
            'cancelled_at', 'cancelled_by', 'cancel_reason',
            'rescheduled_from', 'reschedule_count',
            'created_at',
        )

    def get_doctor_sid(self, obj):
        return obj.doctor.sid if obj.doctor else None

    def get_patient_name(self, obj):
        return obj.patient.full_name

    def get_patient_image(self, obj):
        if obj.patient.image and hasattr(obj.patient.image, 'url'):
            return obj.patient.image.url
        return None

    def get_patient_email(self, obj):
        return obj.patient.user.email

    def get_patient_phone(self, obj):
        return obj.patient.phone

    def get_patient_date_of_birth(self, obj):
        return obj.patient.date_of_birth

    def get_patient_gender(self, obj):
        return obj.patient.gender

    def get_patient_blood_group(self, obj):
        return obj.patient.blood_group

    def get_service_name(self, obj):
        return obj.service.name if obj.service else None

    def get_service_sid(self, obj):
        return obj.service.sid if obj.service else None

    def get_service_duration(self, obj):
        return obj.service.duration_minutes if obj.service else 30

    def get_branch_name(self, obj):
        return obj.branch.name if obj.branch else None

    def get_invoice_status(self, obj):
        try:
            return obj.invoice.status
        except Exception:
            return None


class ServiceDetailSerializer(serializers.ModelSerializer):
    doctors = ServiceDoctorSerializer(many=True, read_only=True)
    doctors_count = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = ('sid', 'name', 'description', 'image', 'cost', 'duration_minutes', 'service_type', 'doctors', 'doctors_count')

    def get_doctors_count(self, obj):
        return obj.doctors.count()
