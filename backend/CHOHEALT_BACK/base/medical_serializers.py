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
        fields = (
            'sid', 'name', 'generic_name', 'category', 'dosage_form', 'strength',
            'cost', 'requires_prescription', 'free_when_prescribed', 'image',
        )


class LabTestSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabTest
        fields = (
            'sid', 'name', 'category', 'description', 'cost', 'image',
            'duration_minutes', 'requires_prescription', 'free_when_prescribed',
        )


class LabTestDetailSerializer(serializers.ModelSerializer):
    """Detail view for patients — includes the staff that can perform it."""
    staff = serializers.SerializerMethodField()

    class Meta:
        model = LabTest
        fields = (
            'sid', 'name', 'category', 'description', 'cost', 'image',
            'duration_minutes', 'requires_prescription', 'free_when_prescribed',
            'staff',
        )

    def get_staff(self, obj):
        return [
            {
                'sid': d.sid,
                'full_name': d.full_name,
                'first_name': d.first_name,
                'first_last_name': d.first_last_name,
                'image': d.image.url if d.image else None,
                'specialization': d.specialization,
                'years_of_experience': d.years_of_experience,
            }
            for d in obj.staff.all()
        ]


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
    status = serializers.ChoiceField(choices=['In Progress', 'Completed', 'Cancelled', 'No Show'])
    # Only relevant when starting a virtual consultation. Required in that case
    # (see `validate`). Ignored for In-Person appointments.
    meeting_link = serializers.URLField(required=False, allow_blank=True, default='')
    meeting_provider = serializers.CharField(required=False, allow_blank=True, default='', max_length=50)

    VALID_TRANSITIONS = {
        'Confirmed': ['In Progress', 'Completed', 'Cancelled', 'No Show'],
        'In Progress': ['Completed', 'Cancelled'],
    }

    def validate(self, data):
        current_status = self.context.get('current_status')
        mode = self.context.get('mode')
        new_status = data['status']
        valid = self.VALID_TRANSITIONS.get(current_status, [])
        if new_status not in valid:
            raise serializers.ValidationError({'status': f'Cannot transition from "{current_status}" to "{new_status}".'})
        # Virtual appointments can only start if the doctor supplied a meeting
        # link — the patient has no other way to join.
        if new_status == 'In Progress' and mode == 'Virtual' and not data.get('meeting_link'):
            raise serializers.ValidationError({'meeting_link': 'A meeting link is required to start a virtual consultation.'})
        return data


class _OptionalPrescriptionCreateSerializer(serializers.Serializer):
    """Nested payload for creating a prescription as part of completing an appointment.

    Unlike `PrescriptionCreateSerializer`, items is optional here because a doctor
    may include the prescription block with additional_notes only — but if the
    block exists AND items are supplied, each item is validated through the
    shared `PrescriptionItemCreateSerializer`.
    """
    additional_notes = serializers.CharField(required=False, default='', allow_blank=True)
    items = PrescriptionItemCreateSerializer(many=True, required=False, default=list)


class _OptionalLabOrderCreateSerializer(serializers.Serializer):
    """Nested payload for creating a lab order as part of completing an appointment."""
    notes = serializers.CharField(required=False, default='', allow_blank=True)
    items = LabOrderItemCreateSerializer(many=True, required=False, default=list)


class AppointmentCompleteSerializer(serializers.Serializer):
    """Atomic payload for the `/appointments/doctor/<sid>/complete/` endpoint.

    Semantics:
      - `diagnosis` is required: the doctor must provide one to complete the visit.
      - `prescription` and `lab_order` are OPTIONAL. If omitted the appointment is
        simply closed with a medical record (no meds, no labs).
      - If `prescription.items` is empty, no Prescription row is created at all
        (avoids an empty prescription tied to the medical record).
      - Same for `lab_order.items`.
    """
    diagnosis = serializers.CharField()
    treatment_plan = serializers.CharField(required=False, default='', allow_blank=True)
    notes = serializers.CharField(required=False, default='', allow_blank=True)
    prescription = _OptionalPrescriptionCreateSerializer(required=False)
    lab_order = _OptionalLabOrderCreateSerializer(required=False)


# ============================================================================
# Patient Read Serializers
# ============================================================================

class PrescriptionItemDetailSerializer(serializers.ModelSerializer):
    medication_info = serializers.SerializerMethodField()
    medication_sid = serializers.SerializerMethodField()
    is_claimed = serializers.SerializerMethodField()

    class Meta:
        model = PrescriptionItem
        fields = (
            'sid', 'medication_sid', 'medication_name', 'is_system_medication', 'medication_info',
            'dosage', 'frequency', 'duration_days', 'instructions',
            'delivery_method', 'delivery_branch', 'delivery_address', 'delivery_status',
            'is_claimed',
        )

    def get_medication_sid(self, obj):
        return obj.medication.sid if obj.medication else None

    def get_medication_info(self, obj):
        if obj.medication:
            return {
                'name': obj.medication.name,
                'generic_name': obj.medication.generic_name,
                'category': obj.medication.category,
                'dosage_form': obj.medication.dosage_form,
                'strength': obj.medication.strength,
                'cost': str(obj.medication.cost),
                'free_when_prescribed': obj.medication.free_when_prescribed,
            }
        return None

    def get_is_claimed(self, obj):
        """True when this prescription item has already been consumed by a
        MedicineOrderItem (the patient either requested a free claim or a
        paid purchase that used this prescription as proof).
        """
        return hasattr(obj, 'medicine_order_item') and obj.medicine_order_item is not None


class PrescriptionDetailSerializer(serializers.ModelSerializer):
    items = PrescriptionItemDetailSerializer(many=True, read_only=True)

    class Meta:
        model = Prescription
        fields = ('sid', 'additional_notes', 'items', 'created_at')


class LabOrderItemDetailSerializer(serializers.ModelSerializer):
    test_sid = serializers.CharField(source='test.sid', read_only=True)
    test_name = serializers.CharField(source='test.name', read_only=True)
    test_category = serializers.CharField(source='test.category', read_only=True)
    has_result = serializers.SerializerMethodField()

    class Meta:
        model = LabOrderItem
        fields = (
            'sid', 'test_sid', 'test_name', 'test_category',
            'notes', 'is_claimed', 'has_result',
        )

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
        fields = (
            'sid', 'name', 'generic_name', 'description', 'image', 'category',
            'dosage_form', 'strength', 'cost', 'requires_prescription',
            'free_when_prescribed',
        )


class MedicineOrderItemCreateSerializer(serializers.Serializer):
    medication_sid = serializers.CharField()
    quantity = serializers.IntegerField(min_value=1, default=1)

    def validate_medication_sid(self, value):
        # Existence-only check. The rule "prescription-required meds need an
        # active prescription" is enforced in `MedicineOrderCreateView.post`
        # so we can resolve the active PrescriptionItem and price the order
        # atomically in a single place.
        if not Medication.objects.filter(sid=value, is_active=True).exists():
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
        fields = (
            'sid', 'status', 'delivery_method', 'total', 'items_count',
            'pickup_code', 'created_at',
        )

    def get_items_count(self, obj):
        return obj.items.count()


class MedicineOrderDetailSerializer(serializers.ModelSerializer):
    items = MedicineOrderItemDetailSerializer(many=True, read_only=True)
    branch_name = serializers.SerializerMethodField()

    class Meta:
        model = MedicineOrder
        fields = (
            'sid', 'status', 'delivery_method', 'branch_name', 'delivery_address',
            'subtotal', 'total', 'notes', 'items', 'pickup_code', 'created_at',
        )

    def get_branch_name(self, obj):
        return obj.delivery_branch.name if obj.delivery_branch else None
