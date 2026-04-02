from django.contrib import admin
from .models import Doctor, Notification


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'first_last_name', 'specialization', 'years_of_experience', 'next_available_appointment_date')
    search_fields = ('first_name', 'first_last_name', 'specialization', 'user__email')
    list_filter = ('specialization', 'country')


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('type', 'doctor', 'patient', 'is_read', 'created_at')
    list_filter = ('type', 'is_read')
    search_fields = ('doctor__first_name', 'doctor__first_last_name', 'patient__first_name', 'patient__first_last_name')
