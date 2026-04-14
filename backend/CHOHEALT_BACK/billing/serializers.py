from rest_framework import serializers
from .models import Payment


def _medicine_order_doctor(order):
    """Resolve the prescribing doctor for a medicine order, if any.

    An order can be linked to a doctor two ways:
      - `source_prescription` (set only by the prescription-bundled delivery
        flow)
      - its line items' `source_prescription_item` (set when the patient
        claims individual prescribed meds through the cart checkout).

    We pick whichever is available so the payments page shows the doctor's
    name for both flows.
    """
    if order.source_prescription_id:
        doctor = order.source_prescription.medical_record.doctor
        if doctor:
            return doctor
    # Fallback: inspect the line items for a linked prescription item.
    rx_item = (
        order.items
        .select_related('source_prescription_item__prescription__medical_record__doctor')
        .filter(source_prescription_item__isnull=False)
        .first()
    )
    if rx_item and rx_item.source_prescription_item:
        doctor = rx_item.source_prescription_item.prescription.medical_record.doctor
        if doctor:
            return doctor
    return None


def _medicine_order_service_label(order):
    """Human-readable label for the payments table when the invoice is backed
    by a MedicineOrder. Shows "Medicine x3" for quick scanning and falls back
    to the first item name when there's only one.
    """
    items = list(order.items.select_related('medication').all()[:2])
    total_count = order.items.count()
    if total_count == 0:
        return 'Medicine order'
    if total_count == 1:
        return items[0].medication.name
    return f'Medicine order ({total_count} items)'


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
        if appt and appt.service:
            return appt.service.name
        if appt and appt.lab_test:
            return appt.lab_test.name
        order = getattr(obj.invoice, 'medicine_order', None)
        if order:
            return _medicine_order_service_label(order)
        return None


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
        # Medicine orders don't have a direct doctor FK — walk the Rx chain.
        order = getattr(obj.invoice, 'medicine_order', None)
        if order:
            doctor = _medicine_order_doctor(order)
            if doctor:
                return f'Dr. {doctor.first_name} {doctor.first_last_name}'
        return None

    def get_service_name(self, obj):
        appt = obj.invoice.appointment
        if appt and appt.service:
            return appt.service.name
        if appt and appt.lab_test:
            return appt.lab_test.name
        order = getattr(obj.invoice, 'medicine_order', None)
        if order:
            return _medicine_order_service_label(order)
        return None
