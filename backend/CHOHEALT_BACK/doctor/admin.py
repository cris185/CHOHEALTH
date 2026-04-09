from django import forms
from django.contrib import admin
from django.shortcuts import render, redirect
from django.urls import path
from django.contrib import messages
from .models import Doctor, DoctorQualification, DoctorSchedule, Notification, DAY_OF_WEEK


class DoctorScheduleInline(admin.TabularInline):
    model = DoctorSchedule
    extra = 1


class DoctorQualificationInline(admin.TabularInline):
    model = DoctorQualification
    extra = 1


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'first_last_name', 'specialization', 'years_of_experience')
    search_fields = ('first_name', 'first_last_name', 'specialization', 'user__email')
    list_filter = ('specialization', 'country')
    inlines = [DoctorQualificationInline, DoctorScheduleInline]


@admin.register(DoctorQualification)
class DoctorQualificationAdmin(admin.ModelAdmin):
    list_display = ('doctor', 'degree', 'institution', 'year')
    search_fields = ('doctor__first_name', 'doctor__first_last_name', 'degree', 'institution')
    list_filter = ('year',)


class BulkScheduleForm(forms.Form):
    doctor = forms.ModelChoiceField(queryset=Doctor.objects.all())
    days = forms.MultipleChoiceField(
        choices=DAY_OF_WEEK,
        widget=forms.CheckboxSelectMultiple,
        label='Days of the week',
    )
    start_time = forms.TimeField(widget=forms.TimeInput(attrs={'type': 'time'}))
    end_time = forms.TimeField(widget=forms.TimeInput(attrs={'type': 'time'}))
    break_start = forms.TimeField(widget=forms.TimeInput(attrs={'type': 'time'}), required=False)
    break_end = forms.TimeField(widget=forms.TimeInput(attrs={'type': 'time'}), required=False)


@admin.register(DoctorSchedule)
class DoctorScheduleAdmin(admin.ModelAdmin):
    list_display = ('doctor', 'day_of_week', 'start_time', 'end_time', 'break_start', 'break_end', 'is_active')
    list_filter = ('day_of_week', 'is_active', 'doctor')
    search_fields = ('doctor__first_name', 'doctor__first_last_name')
    change_list_template = 'admin/doctor/doctorschedule/change_list.html'

    def get_urls(self):
        custom_urls = [
            path('bulk-create/', self.admin_site.admin_view(self.bulk_create_view), name='doctorschedule-bulk-create'),
        ]
        return custom_urls + super().get_urls()

    def bulk_create_view(self, request):
        if request.method == 'POST':
            form = BulkScheduleForm(request.POST)
            if form.is_valid():
                doctor = form.cleaned_data['doctor']
                days = form.cleaned_data['days']
                created = 0
                updated = 0

                for day in days:
                    _, was_created = DoctorSchedule.objects.update_or_create(
                        doctor=doctor,
                        day_of_week=int(day),
                        start_time=form.cleaned_data['start_time'],
                        defaults={
                            'end_time': form.cleaned_data['end_time'],
                            'break_start': form.cleaned_data['break_start'],
                            'break_end': form.cleaned_data['break_end'],
                            'is_active': True,
                        },
                    )
                    if was_created:
                        created += 1
                    else:
                        updated += 1

                msg = f'{created} schedule(s) created'
                if updated:
                    msg += f', {updated} updated'
                messages.success(request, msg)
                return redirect('..')
        else:
            form = BulkScheduleForm()

        return render(request, 'admin/doctor/doctorschedule/bulk_create.html', {
            'form': form,
            'title': 'Bulk Create Schedules',
            'opts': self.model._meta,
        })


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('type', 'recipient', 'title', 'is_read', 'created_at')
    list_filter = ('type', 'is_read')
    search_fields = ('recipient__email', 'title', 'message')
