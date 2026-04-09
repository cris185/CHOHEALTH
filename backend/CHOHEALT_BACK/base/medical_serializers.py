from rest_framework import serializers
from .models import (
    Medication, MedicalRecord, Prescription, PrescriptionItem,
    LabTest, LabOrder, LabOrderItem, LabResult, Appointment,
    MedicineOrder, MedicineOrderItem,
)
from doctor.models import Doctor


# ============================================================================
# Catalog Serializers (for doctor autocomplete)
# ============================================================================

class MedicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Medication
        fields = ('sid', 'name', 'generic_name', 'category', 'dosage_form', 'strength')


class LabTestSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabTest
        fields = ('sid', 'name', 'category', 'description', 'cost')


# ============================================================================
# Doctor Write Serializers (creating medical records, prescriptions, labs)
# ============================================================================

class MedicalRecordCreateSerializer(serializers.Serializer):
    diagnosis = serializers.CharField()
    treatment_plan = serializers.CharField(required=False, default='', allow_blank=True)
    notes = serializers.CharField(required=False, default='', allow_blank=True)


class PrescriptionItemCreateSerializer(serializers.Serializer):
    medication_sid = serializers.CharField(required=False, default='', allow_blank=True)
    medication_name = serializers.CharField(max_length=200, required=False, default='', allow_blank=True)
    dosage = serializers.CharField(max_length=100)
    frequency = serializers.CharField(max_length=50)
    duration_days = serializers.IntegerField(min_value=1)
    instructions = serializers.CharField(required=False, default='', allow_blank=True)

    def validate(self, data):
        if not data.get('medication_sid') and not data.get('medication_name'):
            raise serializers.ValidationError('Either medication_sid or medication_name is required.')
        if data.get('medication_sid'):
            try:
                data['_medication'] = Medication.objects.get(sid=data['medication_sid'], is_active=True)
            except Medication.DoesNotExist:
                raise serializers.ValidationError({'medication_sid': 'Medication not found.'})
        else:
            data['_medication'] = None
        return data


class PrescriptionCreateSerializer(serializers.Serializer):
    additional_notes = serializers.CharField(required=False, default='', allow_blank=True)
    items = PrescriptionItemCreateSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('At least one medication item is required.')
        return value


class LabOrderItemCreateSerializer(serializers.Serializer):
    test_sid = serializers.CharField()
    notes = serializers.CharField(required=False, default='', allow_blank=True)

    def validate_test_sid(self, value):
        try:
            Medication  # just to avoid unused import warning
            LabTest.objects.get(sid=value, is_active=True)
        except LabTest.DoesNotExist:
            raise serializers.ValidationError('Lab test not found.')
        return value


class LabOrderCreateSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, default='', allow_blank=True)
    items = LabOrderItemCreateSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('At least one lab test is required.')
        return value


class AppointmentStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['Confirmed', 'In Progress', 'Completed', 'Cancelled', 'No Show'])

    VALID_TRANSITIONS = {
        'Scheduled': ['Confirmed', 'Cancelled'],
        'Confirmed': ['In Progress', 'Completed', 'Cancelled', 'No Show'],
        'In Progress': ['Completed', 'Cancelled'],
    }

    def validate(self, data):
        current_status = self.context.get('current_status')
        new_status = data['status']
        valid = self.VALID_TRANSITIONS.get(current_status, [])
        if new_status not in valid:
            raise serializers.ValidationError({'status': f'Cannot transition from "{current_status}" to "{new_status}".'})
        return data


# ============================================================================
# Patient Read Serializers
# ============================================================================

class PrescriptionItemDetailSerializer(serializers.ModelSerializer):
    medication_info = serializers.SerializerMethodField()

    class Meta:
        model = PrescriptionItem
        fields = (
            'sid', 'medication_name', 'is_system_medication', 'medication_info',
            'dosage', 'frequency', 'duration_days', 'instructions',
            'delivery_method', 'delivery_branch', 'delivery_address', 'delivery_status',
        )

    def get_medication_info(self, obj):
        if obj.medication:
            return {
                'name': obj.medication.name,
                'generic_name': obj.medication.generic_name,
                'category': obj.medication.category,
                'dosage_form': obj.medication.dosage_form,
                'strength': obj.medication.strength,
            }
        return None


class PrescriptionDetailSerializer(serializers.ModelSerializer):
    items = PrescriptionItemDetailSerializer(many=True, read_only=True)

    class Meta:
        model = Prescription
        fields = ('sid', 'additional_notes', 'items', 'created_at')


class LabOrderItemDetailSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source='test.name', read_only=True)
    test_category = serializers.CharField(source='test.category', read_only=True)
    has_result = serializers.SerializerMethodField()

    class Meta:
        model = LabOrderItem
        fields = ('sid', 'test_name', 'test_category', 'notes', 'has_result')

    def get_has_result(self, obj):
        return hasattr(obj, 'result')


class LabOrderDetailSerializer(serializers.ModelSerializer):
    items = LabOrderItemDetailSerializer(many=True, read_only=True)

    class Meta:
        model = LabOrder
        fields = ('sid', 'status', 'is_prescribed', 'notes', 'items', 'ordered_at')


class LabResultDetailSerializer(serializers.ModelSerializer):
    test_name = serializers.SerializerMethodField()

    class Meta:
        model = LabResult
        fields = ('sid', 'test_name', 'result_text', 'result_file', 'notes', 'completed_at')

    def get_test_name(self, obj):
        return obj.lab_order_item.test.name


class MedicalRecordListSerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()
    has_prescription = serializers.SerializerMethodField()
    has_lab_orders = serializers.SerializerMethodField()

    class Meta:
        model = MedicalRecord
        fields = ('sid', 'diagnosis', 'doctor_name', 'has_prescription', 'has_lab_orders', 'created_at')

    def get_doctor_name(self, obj):
        return f'Dr. {obj.doctor.first_name} {obj.doctor.first_last_name}' if obj.doctor else None

    def get_has_prescription(self, obj):
        return hasattr(obj, 'prescription')

    def get_has_lab_orders(self, obj):
        return obj.lab_orders.exists()


class MedicalRecordDetailSerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()
    prescription = PrescriptionDetailSerializer(read_only=True)
    lab_orders = LabOrderDetailSerializer(many=True, read_only=True)

    class Meta:
        model = MedicalRecord
        fields = ('sid', 'diagnosis', 'treatment_plan', 'notes', 'doctor_name', 'prescription', 'lab_orders', 'created_at')

    def get_doctor_name(self, obj):
        return f'Dr. {obj.doctor.first_name} {obj.doctor.first_last_name}' if obj.doctor else None


# ============================================================================
# Delivery Request Serializer (patient requesting pickup/delivery)
# ============================================================================

class DeliveryRequestSerializer(serializers.Serializer):
    delivery_method = serializers.ChoiceField(choices=['pickup', 'delivery'])
    branch_sid = serializers.CharField(required=False, default='', allow_blank=True)
    delivery_address = serializers.CharField(required=False, default='', allow_blank=True)

    def validate(self, data):
        if data['delivery_method'] == 'pickup' and not data.get('branch_sid'):
            raise serializers.ValidationError({'branch_sid': 'Branch is required for pickup.'})
        if data['delivery_method'] == 'delivery' and not data.get('delivery_address'):
            raise serializers.ValidationError({'delivery_address': 'Address is required for delivery.'})
        return data


# ============================================================================
# Medicine Shop (patient purchasing medications)
# ============================================================================

class MedicationCatalogSerializer(serializers.ModelSerializer):
    """Public catalog for patients to browse and purchase."""
    class Meta:
        model = Medication
        fields = ('sid', 'name', 'generic_name', 'description', 'category', 'dosage_form', 'strength', 'cost', 'requires_prescription')


class MedicineOrderItemCreateSerializer(serializers.Serializer):
    medication_sid = serializers.CharField()
    quantity = serializers.IntegerField(min_value=1, default=1)

    def validate_medication_sid(self, value):
        try:
            med = Medication.objects.get(sid=value, is_active=True)
            if med.requires_prescription:
                raise serializers.ValidationError('This medication requires a prescription.')
        except Medication.DoesNotExist:
            raise serializers.ValidationError('Medication not found.')
        return value


class MedicineOrderCreateSerializer(serializers.Serializer):
    delivery_method = serializers.ChoiceField(choices=['pickup', 'delivery'])
    branch_sid = serializers.CharField(required=False, default='', allow_blank=True)
    delivery_address = serializers.CharField(required=False, default='', allow_blank=True)
    items = MedicineOrderItemCreateSerializer(many=True)
    notes = serializers.CharField(required=False, default='', allow_blank=True)

    def validate(self, data):
        if not data.get('items'):
            raise serializers.ValidationError({'items': 'At least one medication is required.'})
        if data['delivery_method'] == 'pickup' and not data.get('branch_sid'):
            raise serializers.ValidationError({'branch_sid': 'Branch is required for pickup.'})
        if data['delivery_method'] == 'delivery' and not data.get('delivery_address'):
            raise serializers.ValidationError({'delivery_address': 'Address is required for delivery.'})
        return data


class MedicineOrderItemDetailSerializer(serializers.ModelSerializer):
    medication_name = serializers.CharField(source='medication.name', read_only=True)
    medication_strength = serializers.CharField(source='medication.strength', read_only=True)

    class Meta:
        model = MedicineOrderItem
        fields = ('sid', 'medication_name', 'medication_strength', 'quantity', 'unit_price', 'total')


class MedicineOrderListSerializer(serializers.ModelSerializer):
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = MedicineOrder
        fields = ('sid', 'status', 'delivery_method', 'total', 'items_count', 'created_at')

    def get_items_count(self, obj):
        return obj.items.count()


class MedicineOrderDetailSerializer(serializers.ModelSerializer):
    items = MedicineOrderItemDetailSerializer(many=True, read_only=True)
    branch_name = serializers.SerializerMethodField()

    class Meta:
        model = MedicineOrder
        fields = ('sid', 'status', 'delivery_method', 'branch_name', 'delivery_address', 'subtotal', 'total', 'notes', 'items', 'created_at')

    def get_branch_name(self, obj):
        return obj.delivery_branch.name if obj.delivery_branch else None
