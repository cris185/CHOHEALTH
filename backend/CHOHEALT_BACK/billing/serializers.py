from rest_framework import serializers
from .models import Payment


class DoctorPaymentSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    service_name = serializers.SerializerMethodField()
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)

    class Meta:
        model = Payment
        fields = ('sid', 'patient_name', 'service_name', 'invoice_number', 'amount', 'payment_method', 'status', 'paid_at', 'created_at')

    def get_patient_name(self, obj):
        return obj.invoice.patient.full_name if obj.invoice.patient else None

    def get_service_name(self, obj):
        appt = obj.invoice.appointment
        return appt.service.name if appt and appt.service else None


class PatientPaymentSerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()
    service_name = serializers.SerializerMethodField()
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)

    class Meta:
        model = Payment
        fields = ('sid', 'doctor_name', 'service_name', 'invoice_number', 'amount', 'payment_method', 'status', 'paid_at', 'created_at')

    def get_doctor_name(self, obj):
        appt = obj.invoice.appointment
        if appt and appt.doctor:
            return f'Dr. {appt.doctor.first_name} {appt.doctor.first_last_name}'
        return None

    def get_service_name(self, obj):
        appt = obj.invoice.appointment
        return appt.service.name if appt and appt.service else None
