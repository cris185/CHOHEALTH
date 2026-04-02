from django.contrib import admin
from .models import Patient


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'first_last_name', 'user', 'phone', 'gender', 'blood_group')
    search_fields = ('first_name', 'first_last_name', 'user__email', 'phone')
    list_filter = ('gender', 'blood_group')
