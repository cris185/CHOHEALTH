from datetime import datetime, timedelta, time
from django.conf import settings
from django.utils import timezone
import zoneinfo

from .models import Doctor, DoctorSchedule
from base.models import Appointment  # noqa: F401 — Service/LabTest typed via docstring


tz = zoneinfo.ZoneInfo(settings.TIME_ZONE)

# Statuses that block a time slot. Unpaid is NOT here — unpaid appointments
# don't reserve slots, they only become blocking once payment confirms.
BLOCKING_STATUSES = ['Confirmed', 'In Progress']

# Fixed visual interval for the timeline. Slots are always shown every 30 min
# regardless of service duration. The backend still checks whether the FULL
# service fits (duration, break, shift end, booked conflicts).
SLOT_INTERVAL_MINUTES = 30


def get_available_slots(doctor: Doctor, date, bookable) -> dict:
    """
    Compute available time slots for a doctor on a specific date.
    `bookable` is anything with a `.duration_minutes` attribute — currently
    either a `Service` or a `LabTest`.

    Slots are generated at FIXED 30-minute intervals. For each slot we check
    whether the full service/lab duration fits without overlapping a break,
    exceeding the shift end, or conflicting with an existing appointment. The
    slot carries an `unavailable_reason` so the frontend can display a helpful
    message.
    """
    day_of_week = date.weekday()
    schedules = DoctorSchedule.objects.filter(
        doctor=doctor, day_of_week=day_of_week, is_active=True
    ).order_by('start_time')

    if not schedules.exists():
        return {'schedules': [], 'slots': [], 'summary': _empty_summary()}

    service_duration = timedelta(minutes=bookable.duration_minutes)
    step = timedelta(minutes=SLOT_INTERVAL_MINUTES)

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

    for schedule in schedules:
        sched_start = datetime.combine(date, schedule.start_time).replace(tzinfo=tz)
        sched_end = datetime.combine(date, schedule.end_time).replace(tzinfo=tz)
        break_start = datetime.combine(date, schedule.break_start).replace(tzinfo=tz) if schedule.break_start else None
        break_end = datetime.combine(date, schedule.break_end).replace(tzinfo=tz) if schedule.break_end else None

        current = sched_start
        while current < sched_end:
            slot_end = current + service_duration

            # Determine availability and the reason if not available.
            unavailable_reason = None

            if current <= now:
                unavailable_reason = 'past'
            elif slot_end > sched_end:
                # Service extends beyond the doctor's shift end.
                unavailable_reason = 'shift_end'
            elif break_start and break_end and current < break_end and slot_end > break_start:
                # Service overlaps with the doctor's break.
                unavailable_reason = 'break'
            else:
                # Check overlap with existing confirmed appointments.
                for booked_start, booked_end in booked_ranges:
                    if current < booked_end and slot_end > booked_start:
                        unavailable_reason = 'booked'
                        break

            is_break = unavailable_reason == 'break'
            is_booked = unavailable_reason == 'booked'

            all_slots.append({
                'time': current.strftime('%H:%M'),
                'available': unavailable_reason is None,
                'is_break': is_break,
                'is_booked': is_booked,
                'unavailable_reason': unavailable_reason,
            })

            current += step

        schedule_data.append({
            'start_time': schedule.start_time.strftime('%H:%M'),
            'end_time': schedule.end_time.strftime('%H:%M'),
            'break_start': schedule.break_start.strftime('%H:%M') if schedule.break_start else None,
            'break_end': schedule.break_end.strftime('%H:%M') if schedule.break_end else None,
        })

    # Build summary
    bookable_slots = [s for s in all_slots if not s['is_break']]
    total_slots = len(bookable_slots)
    booked_slots = sum(1 for s in bookable_slots if s['is_booked'])
    available_slots = sum(1 for s in all_slots if s['available'])
    break_slots = sum(1 for s in all_slots if s['is_break'])
    occupancy_percent = round((booked_slots / total_slots) * 100, 1) if total_slots > 0 else 0

    return {
        'schedules': schedule_data,
        'slots': all_slots,
        'summary': {
            'total_slots': total_slots,
            'booked_slots': booked_slots,
            'available_slots': available_slots,
            'break_slots': break_slots,
            'occupancy_percent': occupancy_percent,
        },
    }


def _empty_summary():
    return {
        'total_slots': 0,
        'booked_slots': 0,
        'available_slots': 0,
        'break_slots': 0,
        'occupancy_percent': 0,
    }


def get_available_days(doctor: Doctor, year: int, month: int, bookable) -> list[dict]:
    """
    Returns list of dicts with date and occupancy info where the doctor has a
    schedule in the given month (including fully-booked days). `bookable` is
    any object with `.duration_minutes` (Service or LabTest).
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
    days_info = []

    for day in range(1, num_days + 1):
        d = datetime(year, month, day).date()
        if d < today:
            continue
        if d.weekday() in working_days:
            result = get_available_slots(doctor, d, bookable)
            summary = result['summary']
            # Include all working days (even fully booked ones)
            if summary['total_slots'] > 0:
                days_info.append({
                    'date': d.isoformat(),
                    'total_slots': summary['total_slots'],
                    'booked_slots': summary['booked_slots'],
                    'available_slots': summary['available_slots'],
                    'occupancy_percent': summary['occupancy_percent'],
                })

    return days_info
