from django import forms
from django.contrib import admin
from django.shortcuts import render, redirect
from django.urls import path
from django.contrib import messages
from .models import Doctor, DoctorSchedule, Notification, DAY_OF_WEEK, SHIFT_TYPE


class DoctorScheduleInline(admin.TabularInline):
    model = DoctorSchedule
    extra = 1


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'first_last_name', 'specialization', 'years_of_experience')
    search_fields = ('first_name', 'first_last_name', 'specialization', 'user__email')
    list_filter = ('specialization', 'country')
    inlines = [DoctorScheduleInline]


class BulkScheduleForm(forms.Form):
    doctor = forms.ModelChoiceField(queryset=Doctor.objects.all())
    days = forms.MultipleChoiceField(
        choices=DAY_OF_WEEK,
        widget=forms.CheckboxSelectMultiple,
        label='Days of the week',
    )
    shift_type = forms.ChoiceField(choices=SHIFT_TYPE)
    start_time = forms.TimeField(widget=forms.TimeInput(attrs={'type': 'time'}))
    end_time = forms.TimeField(widget=forms.TimeInput(attrs={'type': 'time'}))
    break_start = forms.TimeField(widget=forms.TimeInput(attrs={'type': 'time'}), required=False)
    break_end = forms.TimeField(widget=forms.TimeInput(attrs={'type': 'time'}), required=False)


@admin.register(DoctorSchedule)
class DoctorScheduleAdmin(admin.ModelAdmin):
    list_display = ('doctor', 'day_of_week', 'shift_type', 'start_time', 'end_time', 'break_start', 'break_end', 'is_active')
    list_filter = ('day_of_week', 'shift_type', 'is_active', 'doctor')
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
                skipped = 0

                for day in days:
                    _, was_created = DoctorSchedule.objects.update_or_create(
                        doctor=doctor,
                        day_of_week=int(day),
                        shift_type=form.cleaned_data['shift_type'],
                        defaults={
                            'start_time': form.cleaned_data['start_time'],
                            'end_time': form.cleaned_data['end_time'],
                            'break_start': form.cleaned_data['break_start'],
                            'break_end': form.cleaned_data['break_end'],
                            'is_active': True,
                        },
                    )
                    if was_created:
                        created += 1
                    else:
                        skipped += 1

                msg = f'{created} schedule(s) created'
                if skipped:
                    msg += f', {skipped} updated (already existed)'
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
    list_display = ('type', 'doctor', 'patient', 'is_read', 'created_at')
    list_filter = ('type', 'is_read')
    search_fields = ('doctor__first_name', 'doctor__first_last_name', 'patient__first_name', 'patient__first_last_name')