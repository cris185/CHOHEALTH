'use client';

import { useTranslations } from 'next-intl';
import type { TimeSlot, ScheduleBlock } from '@/lib/api';

interface PatientDayTimelineProps {
  date: string;
  slots: TimeSlot[];
  schedules: ScheduleBlock[];
  serviceDuration: number;
  selectedSlot: string | null;
  onSelectSlot: (time: string) => void;
  loading?: boolean;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const m = minutes % 60;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function PatientDayTimeline({
  date, slots, schedules, serviceDuration, selectedSlot, onSelectSlot, loading,
}: PatientDayTimelineProps) {
  const t = useTranslations();

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  if (loading) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-32 bg-gray-100 rounded" />
          <div className="space-y-2 mt-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-50 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{formattedDate}</h3>
        <p className="text-gray-500">{t('booking.noSchedule')}</p>
      </div>
    );
  }

  // Compute timeline range from schedules
  const scheduleStartMin = Math.min(...schedules.map((s) => timeToMinutes(s.start_time)));
  const scheduleEndMin = Math.max(...schedules.map((s) => timeToMinutes(s.end_time)));
  const totalMin = scheduleEndMin - scheduleStartMin;

  // Build hour labels
  const hours: { label: string; minutes: number }[] = [];
  const firstHour = Math.floor(scheduleStartMin / 60) * 60;
  for (let m = firstHour; m <= scheduleEndMin; m += 60) {
    hours.push({ label: minutesToLabel(m), minutes: m });
  }

  // Build break ranges from schedules
  const breakRanges = schedules
    .filter((s) => s.break_start && s.break_end)
    .map((s) => ({
      startMin: timeToMinutes(s.break_start!),
      endMin: timeToMinutes(s.break_end!),
    }));

  // Build slot blocks with their actual duration
  const slotBlocks = slots.map((slot) => {
    const slotStartMin = timeToMinutes(slot.time);
    const slotEndMin = slotStartMin + serviceDuration;
    return { ...slot, startMin: slotStartMin, endMin: slotEndMin };
  });

  const HOUR_HEIGHT = 80; // px per 60 minutes
  const timelineHeight = (totalMin / 60) * HOUR_HEIGHT;

  const getTop = (minutes: number) => ((minutes - scheduleStartMin) / totalMin) * timelineHeight;
  const getHeight = (durationMin: number) => (durationMin / totalMin) * timelineHeight;

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{formattedDate}</h3>
      <p className="text-sm text-gray-500 mb-2">
        {minutesToLabel(scheduleStartMin)} - {minutesToLabel(scheduleEndMin)} &middot; {serviceDuration} min per slot
      </p>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-emerald-100 border border-emerald-300" />
          {t('booking.available')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-gray-200 border border-gray-300" />
          {t('booking.booked')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-yellow-100 border border-yellow-300" />
          {t('booking.break')}
        </span>
      </div>

      {/* Timeline */}
      <div className="relative" style={{ height: `${timelineHeight}px` }}>
        {/* Hour grid lines */}
        {hours.map(({ label, minutes }) => {
          const top = getTop(minutes);
          if (top < 0) return null;
          return (
            <div
              key={label}
              className="absolute left-0 right-0 border-t border-gray-100"
              style={{ top: `${top}px` }}
            >
              <span className="absolute -top-2.5 left-0 text-[11px] font-medium text-gray-400 bg-white pr-2 select-none">
                {label}
              </span>
            </div>
          );
        })}

        {/* Break blocks */}
        {breakRanges.map((br, i) => (
          <div
            key={`break-${i}`}
            className="absolute left-16 right-0 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-center z-10"
            style={{
              top: `${getTop(br.startMin)}px`,
              height: `${getHeight(br.endMin - br.startMin)}px`,
              minHeight: '32px',
            }}
          >
            <div className="text-center">
              <span className="text-xs font-semibold text-yellow-600">{t('booking.break')}</span>
              <span className="block text-[10px] text-yellow-500">
                {minutesToLabel(br.startMin)} - {minutesToLabel(br.endMin)}
              </span>
            </div>
          </div>
        ))}

        {/* Slot blocks */}
        {slotBlocks.map((slot) => {
          const isSelected = selectedSlot === slot.time;

          if (slot.is_break) return null; // breaks rendered separately

          if (slot.is_booked || !slot.available) {
            // Booked / unavailable block
            return (
              <div
                key={slot.time}
                className="absolute left-16 right-0 bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-center z-10 cursor-not-allowed"
                style={{
                  top: `${getTop(slot.startMin)}px`,
                  height: `${getHeight(serviceDuration)}px`,
                  minHeight: '36px',
                }}
              >
                <div className="text-center">
                  <span className="text-xs font-medium text-gray-400">{t('booking.booked')}</span>
                  <span className="block text-[10px] text-gray-400">
                    {minutesToLabel(slot.startMin)} - {minutesToLabel(slot.endMin)}
                  </span>
                </div>
              </div>
            );
          }

          // Available block
          return (
            <div
              key={slot.time}
              className={`absolute left-16 right-0 rounded-lg flex items-center justify-center z-10 cursor-pointer transition-all
                ${isSelected
                  ? 'bg-blue-600 border-2 border-blue-700 ring-2 ring-blue-300 shadow-lg'
                  : 'bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 hover:shadow-md'
                }`}
              style={{
                top: `${getTop(slot.startMin)}px`,
                height: `${getHeight(serviceDuration)}px`,
                minHeight: '36px',
              }}
              onClick={() => onSelectSlot(slot.time)}
            >
              <div className="text-center">
                <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-emerald-700'}`}>
                  {t('booking.available')}
                </span>
                <span className={`block text-[10px] ${isSelected ? 'text-blue-100' : 'text-emerald-600'}`}>
                  {minutesToLabel(slot.startMin)} - {minutesToLabel(slot.endMin)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
