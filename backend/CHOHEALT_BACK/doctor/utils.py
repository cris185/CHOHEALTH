from datetime import datetime, timedelta, time
from django.conf import settings
from django.utils import timezone
import zoneinfo

from .models import Doctor, DoctorSchedule
from base.models import Appointment, Service


tz = zoneinfo.ZoneInfo(settings.TIME_ZONE)

# Statuses that block a time slot
BLOCKING_STATUSES = ['Scheduled', 'Confirmed', 'In Progress']


def get_available_slots(doctor: Doctor, date, service: Service) -> dict:
    """
    Compute available time slots for a doctor on a specific date.
    Handles MULTIPLE schedule blocks per day (e.g., morning + afternoon).
    """
    day_of_week = date.weekday()
    schedules = DoctorSchedule.objects.filter(
        doctor=doctor, day_of_week=day_of_week, is_active=True
    ).order_by('start_time')

    if not schedules.exists():
        return {'schedules': [], 'slots': []}

    duration = timedelta(minutes=service.duration_minutes)

    # Get all booked appointments for this doctor on this date (one query)
    day_start = datetime.combine(date, time.min).replace(tzinfo=tz)
    day_end = datetime.combine(date, time.max).replace(tzinfo=tz)

    appointments = Appointment.objects.filter(
        doctor=doctor,
        date__range=(day_start, day_end),
        status__in=BLOCKING_STATUSES,
    ).select_related('service')

    booked_ranges = []
    for appt in appointments:
        appt_duration = appt.service.duration_minutes if appt.service else 30
        appt_start = appt.date
        appt_end = appt_start + timedelta(minutes=appt_duration)
        booked_ranges.append((appt_start, appt_end))

    now = timezone.now()
    all_slots = []
    schedule_data = []

    # Iterate ALL schedule blocks for the day
    for schedule in schedules:
        current = datetime.combine(date, schedule.start_time).replace(tzinfo=tz)
        end = datetime.combine(date, schedule.end_time).replace(tzinfo=tz)
        break_start = datetime.combine(date, schedule.break_start).replace(tzinfo=tz) if schedule.break_start else None
        break_end = datetime.combine(date, schedule.break_end).replace(tzinfo=tz) if schedule.break_end else None

        while current + duration <= end:
            slot_end = current + duration

            is_break = False
            if break_start and break_end:
                if current < break_end and slot_end > break_start:
                    is_break = True

            is_booked = any(
                current < booked_end and slot_end > booked_start
                for booked_start, booked_end in booked_ranges
            )

            is_past = current <= now

            all_slots.append({
                'time': current.strftime('%H:%M'),
                'available': not is_break and not is_booked and not is_past,
                'is_break': is_break,
                'is_booked': is_booked,
            })

            current += duration

        schedule_data.append({
            'start_time': schedule.start_time.strftime('%H:%M'),
            'end_time': schedule.end_time.strftime('%H:%M'),
            'break_start': schedule.break_start.strftime('%H:%M') if schedule.break_start else None,
            'break_end': schedule.break_end.strftime('%H:%M') if schedule.break_end else None,
        })

    return {'schedules': schedule_data, 'slots': all_slots}


def get_available_days(doctor: Doctor, year: int, month: int, service: Service) -> list[str]:
    """
    Returns list of date strings (YYYY-MM-DD) where the doctor has
    at least one available slot in the given month.
    """
    import calendar

    working_days = set(
        DoctorSchedule.objects.filter(doctor=doctor, is_active=True)
        .values_list('day_of_week', flat=True)
    )

    if not working_days:
        return []

    num_days = calendar.monthrange(year, month)[1]
    today = timezone.now().astimezone(tz).date()
    available = []

    for day in range(1, num_days + 1):
        d = datetime(year, month, day).date()
        if d < today:
            continue
        if d.weekday() in working_days:
            result = get_available_slots(doctor, d, service)
            if any(s['available'] for s in result['slots']):
                available.append(d.isoformat())

    return available
