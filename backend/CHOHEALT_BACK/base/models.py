import shortuuid
from django.db import models
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
# Service
# ============================================================================

class Service(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    image = models.FileField(upload_to='service_images', default='default/default-service.jpg', blank=True)
    cost = models.DecimalField(max_digits=10, decimal_places=2)
    duration_minutes = models.PositiveIntegerField(default=30)
    is_active = models.BooleanField(default=True)
    doctors = models.ManyToManyField(Doctor, related_name='services', blank=True)

    def __str__(self):
        return self.name


# ============================================================================
# Appointment
# ============================================================================

APPOINTMENT_STATUS = (
    ('Pending', 'Pending'),
    ('Confirmed', 'Confirmed'),
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
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='appointments')
    service = models.ForeignKey(Service, on_delete=models.SET_NULL, null=True, blank=True, related_name='appointments')
    date = models.DateTimeField()
    status = models.CharField(max_length=20, choices=APPOINTMENT_STATUS, default='Pending')
    mode = models.CharField(max_length=20, choices=APPOINTMENT_MODE, default='In-Person')

    # In-Person fields
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name='appointments')
    room = models.CharField(max_length=50, blank=True)

    # Virtual fields
    meeting_link = models.URLField(blank=True)
    meeting_provider = models.CharField(max_length=50, blank=True)

    issues = models.TextField(blank=True)
    symptoms = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f'{self.patient.full_name} -> Dr. {self.doctor.first_name} {self.doctor.first_last_name} ({self.date.strftime("%Y-%m-%d %H:%M")})'


# ============================================================================
# Medical Record (uno por cita)
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
# Prescription (vinculada a MedicalRecord)
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


class PrescriptionItem(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name='items')
    medication_name = models.CharField(max_length=200)
    dosage = models.CharField(max_length=100)
    frequency = models.CharField(max_length=50, choices=FREQUENCY_CHOICES)
    duration_days = models.PositiveIntegerField()
    instructions = models.TextField(blank=True)

    def __str__(self):
        return f'{self.medication_name} - {self.dosage} ({self.frequency})'


# ============================================================================
# Lab (Catálogo, Órdenes, Resultados)
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
    test = models.ForeignKey(LabTest, on_delete=models.CASCADE, related_name='orders')
    status = models.CharField(max_length=20, choices=LAB_ORDER_STATUS, default='Ordered')
    notes = models.TextField(blank=True)
    ordered_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.test.name} - {self.medical_record.patient.full_name} ({self.status})'


class LabResult(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    lab_order = models.OneToOneField(LabOrder, on_delete=models.CASCADE, related_name='result')
    result_text = models.TextField(blank=True)
    result_file = models.FileField(upload_to='lab_results', blank=True)
    notes = models.TextField(blank=True)
    completed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Result - {self.lab_order.test.name} ({self.lab_order.medical_record.patient.full_name})'


# ============================================================================
# Review
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

    def __str__(self):
        return f'{self.patient.full_name} - Dr. {self.doctor.first_name} {self.doctor.first_last_name} ({self.rating}/5)'