import shortuuid
from django.db import models
from django.core.exceptions import ValidationError
from doctor.models import Doctor
from patient.models import Patient


# ============================================================================
# Branch (Sedes / Ubicaciones)
# ============================================================================

class Branch(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    name = models.CharField(max_length=200)
    address = models.CharField(max_length=300)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = 'Branches'

    def __str__(self):
        return self.name


# ============================================================================
# Service (with type: Consultation vs Lab)
# ============================================================================

SERVICE_TYPE = (
    ('Consultation', 'Consultation'),
    ('Lab', 'Lab'),
)


class Service(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    image = models.FileField(upload_to='service_images', default='default/default-service.jpg', blank=True)
    cost = models.DecimalField(max_digits=10, decimal_places=2)
    duration_minutes = models.PositiveIntegerField(default=30)
    is_active = models.BooleanField(default=True)
    service_type = models.CharField(max_length=20, choices=SERVICE_TYPE, default='Consultation')
    doctors = models.ManyToManyField(Doctor, related_name='services', blank=True)

    def __str__(self):
        return f'{self.name} ({self.service_type})'


# ============================================================================
# Appointment (clinical status ONLY — payment status is in Invoice)
# ============================================================================

APPOINTMENT_STATUS = (
    ('Scheduled', 'Scheduled'),
    ('Confirmed', 'Confirmed'),
    ('In Progress', 'In Progress'),
    ('Completed', 'Completed'),
    ('Cancelled', 'Cancelled'),
    ('No Show', 'No Show'),
)

APPOINTMENT_MODE = (
    ('In-Person', 'In-Person'),
    ('Virtual', 'Virtual'),
)


class Appointment(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='appointments')
    doctor = models.ForeignKey(Doctor, on_delete=models.SET_NULL, null=True, blank=True, related_name='appointments')
    service = models.ForeignKey(Service, on_delete=models.SET_NULL, null=True, blank=True, related_name='appointments')
    date = models.DateTimeField()
    status = models.CharField(max_length=20, choices=APPOINTMENT_STATUS, default='Scheduled')
    mode = models.CharField(max_length=20, choices=APPOINTMENT_MODE, default='In-Person')

    # In-Person fields
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name='appointments')
    room = models.CharField(max_length=50, blank=True)

    # Virtual fields
    meeting_link = models.URLField(blank=True)
    meeting_provider = models.CharField(max_length=50, blank=True)

    # Lab order link (for lab appointments fulfilling a prescribed order)
    lab_order = models.ForeignKey('LabOrder', on_delete=models.SET_NULL, null=True, blank=True, related_name='lab_appointments')

    issues = models.TextField(blank=True)
    symptoms = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']

    def clean(self):
        if self.mode == 'Virtual':
            if self.branch:
                raise ValidationError('Virtual appointments should not have a branch.')
        elif self.mode == 'In-Person':
            if not self.branch:
                raise ValidationError('In-person appointments require a branch.')

    def __str__(self):
        doctor_str = f'Dr. {self.doctor.first_name} {self.doctor.first_last_name}' if self.doctor else 'Lab Service'
        return f'{self.patient.full_name} -> {doctor_str} ({self.date.strftime("%Y-%m-%d %H:%M")})'


# ============================================================================
# Medical Record (one per completed appointment)
# ============================================================================

class MedicalRecord(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    appointment = models.OneToOneField(Appointment, on_delete=models.CASCADE, related_name='medical_record')
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='medical_records')
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='medical_records')
    diagnosis = models.TextField()
    treatment_plan = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Record - {self.patient.full_name} ({self.created_at.strftime("%Y-%m-%d")})'


# ============================================================================
# Medication Catalog
# ============================================================================

MEDICATION_CATEGORY_CHOICES = (
    ('Antibiotic', 'Antibiotic'),
    ('Painkiller', 'Painkiller'),
    ('Anti-inflammatory', 'Anti-inflammatory'),
    ('Antihypertensive', 'Antihypertensive'),
    ('Antidiabetic', 'Antidiabetic'),
    ('Antihistamine', 'Antihistamine'),
    ('Antidepressant', 'Antidepressant'),
    ('Vitamin', 'Vitamin'),
    ('Supplement', 'Supplement'),
    ('Other', 'Other'),
)

DOSAGE_FORM_CHOICES = (
    ('Tablet', 'Tablet'),
    ('Capsule', 'Capsule'),
    ('Liquid', 'Liquid'),
    ('Injection', 'Injection'),
    ('Cream', 'Cream'),
    ('Ointment', 'Ointment'),
    ('Drops', 'Drops'),
    ('Inhaler', 'Inhaler'),
    ('Patch', 'Patch'),
    ('Suppository', 'Suppository'),
    ('Other', 'Other'),
)


class Medication(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    name = models.CharField(max_length=200)
    generic_name = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=50, choices=MEDICATION_CATEGORY_CHOICES, default='Other')
    dosage_form = models.CharField(max_length=50, choices=DOSAGE_FORM_CHOICES, default='Tablet')
    strength = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    requires_prescription = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        strength_str = f' {self.strength}' if self.strength else ''
        return f'{self.name}{strength_str} ({self.dosage_form})'


# ============================================================================
# Prescription (linked to MedicalRecord)
# ============================================================================

class Prescription(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    medical_record = models.OneToOneField(MedicalRecord, on_delete=models.CASCADE, related_name='prescription')
    additional_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Prescription - {self.medical_record.patient.full_name} ({self.created_at.strftime("%Y-%m-%d")})'


FREQUENCY_CHOICES = (
    ('Once a day', 'Once a day'),
    ('Twice a day', 'Twice a day'),
    ('Three times a day', 'Three times a day'),
    ('Every 4 hours', 'Every 4 hours'),
    ('Every 6 hours', 'Every 6 hours'),
    ('Every 8 hours', 'Every 8 hours'),
    ('Every 12 hours', 'Every 12 hours'),
    ('As needed', 'As needed'),
)


DELIVERY_METHOD_CHOICES = (
    ('external', 'External'),
    ('pickup', 'Pickup'),
    ('delivery', 'Delivery'),
)

DELIVERY_STATUS_CHOICES = (
    ('pending', 'Pending'),
    ('ready', 'Ready for Pickup'),
    ('dispatched', 'Dispatched'),
    ('delivered', 'Delivered'),
    ('collected', 'Collected'),
)


class PrescriptionItem(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name='items')

    # Hybrid: FK to catalog OR free text
    medication = models.ForeignKey(Medication, on_delete=models.SET_NULL, null=True, blank=True, related_name='prescription_items')
    medication_name = models.CharField(max_length=200)
    is_system_medication = models.BooleanField(default=False)

    dosage = models.CharField(max_length=100)
    frequency = models.CharField(max_length=50, choices=FREQUENCY_CHOICES)
    duration_days = models.PositiveIntegerField()
    instructions = models.TextField(blank=True)

    # Delivery (only for system medications)
    delivery_method = models.CharField(max_length=20, choices=DELIVERY_METHOD_CHOICES, default='external')
    delivery_branch = models.ForeignKey('Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='medication_pickups')
    delivery_address = models.CharField(max_length=300, blank=True)
    delivery_status = models.CharField(max_length=20, choices=DELIVERY_STATUS_CHOICES, default='pending')

    def save(self, *args, **kwargs):
        if self.medication:
            self.is_system_medication = True
            if not self.medication_name:
                self.medication_name = str(self.medication)
        super().save(*args, **kwargs)

    def __str__(self):
        source = '(system)' if self.is_system_medication else '(external)'
        return f'{self.medication_name} - {self.dosage} {source}'


# ============================================================================
# Lab (Catalogue, Orders with multiple items, Results per item)
# ============================================================================

LAB_CATEGORY_CHOICES = (
    ('Blood', 'Blood'),
    ('Urine', 'Urine'),
    ('Stool', 'Stool'),
    ('Imaging', 'Imaging'),
    ('Other', 'Other'),
)


class LabTest(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=50, choices=LAB_CATEGORY_CHOICES)
    description = models.TextField(blank=True)
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f'{self.name} ({self.category})'


LAB_ORDER_STATUS = (
    ('Ordered', 'Ordered'),
    ('Sample Collected', 'Sample Collected'),
    ('Processing', 'Processing'),
    ('Completed', 'Completed'),
    ('Cancelled', 'Cancelled'),
)


class LabOrder(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    medical_record = models.ForeignKey(MedicalRecord, on_delete=models.CASCADE, related_name='lab_orders')
    status = models.CharField(max_length=20, choices=LAB_ORDER_STATUS, default='Ordered')
    notes = models.TextField(blank=True)
    ordered_at = models.DateTimeField(auto_now_add=True)

    # Prescription tracking
    is_prescribed = models.BooleanField(default=False)
    source_appointment = models.ForeignKey('Appointment', on_delete=models.SET_NULL, null=True, blank=True, related_name='prescribed_lab_orders')

    def __str__(self):
        prescribed = ' (prescribed)' if self.is_prescribed else ''
        return f'Lab Order{prescribed} - {self.medical_record.patient.full_name} ({self.status})'


class LabOrderItem(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    lab_order = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name='items')
    test = models.ForeignKey(LabTest, on_delete=models.CASCADE, related_name='order_items')
    notes = models.TextField(blank=True)

    def __str__(self):
        return f'{self.test.name} - {self.lab_order.medical_record.patient.full_name}'


class LabResult(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    lab_order_item = models.OneToOneField(LabOrderItem, on_delete=models.CASCADE, related_name='result')
    result_text = models.TextField(blank=True)
    result_file = models.FileField(upload_to='lab_results', blank=True)
    notes = models.TextField(blank=True)
    completed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Result - {self.lab_order_item.test.name}'


# ============================================================================
# Review (only for completed appointments)
# ============================================================================

RATING_CHOICES = (
    (1, '1'),
    (2, '2'),
    (3, '3'),
    (4, '4'),
    (5, '5'),
)


class Review(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='reviews')
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='reviews')
    appointment = models.OneToOneField(Appointment, on_delete=models.CASCADE, related_name='review')
    rating = models.IntegerField(choices=RATING_CHOICES)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        if self.appointment.status != 'Completed':
            raise ValidationError('Can only review completed appointments.')
        if self.appointment.patient != self.patient:
            raise ValidationError('Can only review your own appointments.')


# ============================================================================
# Medicine Orders (direct purchase by patient)
# ============================================================================

MEDICINE_ORDER_STATUS = (
    ('Pending Payment', 'Pending Payment'),
    ('Paid', 'Paid'),
    ('Processing', 'Processing'),
    ('Ready for Pickup', 'Ready for Pickup'),
    ('Dispatched', 'Dispatched'),
    ('Delivered', 'Delivered'),
    ('Collected', 'Collected'),
    ('Cancelled', 'Cancelled'),
)


class MedicineOrder(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='medicine_orders')
    delivery_method = models.CharField(max_length=20, choices=DELIVERY_METHOD_CHOICES, default='pickup')
    delivery_branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name='medicine_orders')
    delivery_address = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=20, choices=MEDICINE_ORDER_STATUS, default='Pending Payment')
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Medicine Order - {self.patient.full_name} ({self.status})'


class MedicineOrderItem(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    order = models.ForeignKey(MedicineOrder, on_delete=models.CASCADE, related_name='items')
    medication = models.ForeignKey(Medication, on_delete=models.CASCADE, related_name='order_items')
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)

    def save(self, *args, **kwargs):
        self.total = self.quantity * self.unit_price
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.medication.name} x{self.quantity}'

    def __str__(self):
        return f'{self.patient.full_name} - Dr. {self.doctor.first_name} {self.doctor.first_last_name} ({self.rating}/5)'
