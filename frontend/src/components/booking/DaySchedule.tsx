'use client';

import { useTranslations } from 'next-intl';
import type { TimeSlot } from '@/lib/api';

interface DayScheduleProps {
  date: string;
  slots: TimeSlot[];
  selectedSlot: string | null;
  onSelectSlot: (time: string) => void;
  loading?: boolean;
}

export default function DaySchedule({ date, slots, selectedSlot, onSelectSlot, loading }: DayScheduleProps) {
  const t = useTranslations();

  const formattedDate = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  });

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-center text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h3 className="mb-1 text-lg font-semibold text-gray-900">{formattedDate}</h3>
      <p className="mb-4 text-sm text-gray-500">{t('booking.selectTime')}</p>

      <div className="mb-3 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-green-100 border border-green-300" /> {t('booking.available')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-gray-200" /> {t('booking.booked')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-yellow-100 border border-yellow-300" /> {t('booking.break')}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {slots.map((slot) => {
          const isSelected = selectedSlot === slot.time;

          let className = 'rounded-md px-3 py-3 text-sm font-medium text-center transition ';

          if (slot.is_break) {
            className += 'bg-yellow-50 text-yellow-600 border border-yellow-200 cursor-not-allowed';
          } else if (slot.is_booked || !slot.available) {
            className += 'bg-gray-100 text-gray-400 cursor-not-allowed';
          } else if (isSelected) {
            className += 'bg-blue-600 text-white ring-2 ring-blue-600 ring-offset-1 cursor-pointer';
          } else {
            className += 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 cursor-pointer';
          }

          return (
            <button
              key={slot.time}
              className={className}
              disabled={slot.is_break || slot.is_booked || !slot.available}
              onClick={() => slot.available && !slot.is_break ? onSelectSlot(slot.time) : undefined}
            >
              {slot.time}
              {slot.is_break && (
                <span className="block text-[10px]">{t('booking.break')}</span>
              )}
            </button>
          );
        })}
      </div>

      {slots.length === 0 && (
        <p className="text-center text-sm text-gray-500">{t('booking.noSchedule')}</p>
      )}
    </div>
  );
}
