from django.contrib import admin
from .models import (
    Branch, Service, Appointment, MedicalRecord,
    Prescription, PrescriptionItem,
    LabTest, LabOrder, LabResult,
    Review,
)


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ('name', 'address', 'phone', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name', 'address')


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ('name', 'cost', 'duration_minutes', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name',)
    filter_horizontal = ('doctors',)


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ('sid', 'patient', 'doctor', 'date', 'mode', 'status')
    list_filter = ('status', 'mode', 'date', 'branch')
    search_fields = ('sid', 'patient__first_name', 'patient__first_last_name', 'doctor__first_name', 'doctor__first_last_name')


class PrescriptionItemInline(admin.TabularInline):
    model = PrescriptionItem
    extra = 1


@admin.register(Prescription)
class PrescriptionAdmin(admin.ModelAdmin):
    list_display = ('sid', 'medical_record', 'created_at')
    inlines = [PrescriptionItemInline]


class LabOrderInline(admin.TabularInline):
    model = LabOrder
    extra = 1


class PrescriptionInline(admin.StackedInline):
    model = Prescription
    extra = 0


@admin.register(MedicalRecord)
class MedicalRecordAdmin(admin.ModelAdmin):
    list_display = ('sid', 'patient', 'doctor', 'appointment', 'created_at')
    search_fields = ('patient__first_name', 'patient__first_last_name', 'doctor__first_name')
    inlines = [PrescriptionInline, LabOrderInline]


@admin.register(LabTest)
class LabTestAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'cost', 'is_active')
    list_filter = ('category', 'is_active')
    search_fields = ('name',)


@admin.register(LabOrder)
class LabOrderAdmin(admin.ModelAdmin):
    list_display = ('test', 'medical_record', 'status', 'ordered_at')
    list_filter = ('status',)


@admin.register(LabResult)
class LabResultAdmin(admin.ModelAdmin):
    list_display = ('lab_order', 'completed_at')


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ('patient', 'doctor', 'rating', 'created_at')
    list_filter = ('rating',)
    search_fields = ('patient__first_name', 'doctor__first_name')