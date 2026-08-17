'use client';

import { useTranslations } from 'next-intl';
import type { DayInfo } from '@/lib/api';
import { getTodayInNY } from '@/lib/tz';

interface MonthCalendarProps {
  year: number;
  month: number;
  availableDays: DayInfo[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onMonthChange: (year: number, month: number) => void;
  loading?: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getOccupancyColor(percent: number): { bg: string; border: string; dot: string; text: string } {
  if (percent >= 100) return { bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500', text: 'text-red-600' };
  if (percent >= 75) return { bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500', text: 'text-orange-600' };
  if (percent >= 50) return { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500', text: 'text-amber-600' };
  if (percent >= 25) return { bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500', text: 'text-blue-600' };
  return { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-600' };
}

export default function MonthCalendar({
  year, month, availableDays, selectedDate, onSelectDate, onMonthChange, loading,
}: MonthCalendarProps) {
  const t = useTranslations();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = getTodayInNY();

  const dayInfoMap = new Map(availableDays.map((d) => [d.date, d]));

  const prevMonth = () => {
    if (month === 0) onMonthChange(year - 1, 11);
    else onMonthChange(year, month - 1);
  };

  const nextMonth = () => {
    if (month === 11) onMonthChange(year + 1, 0);
    else onMonthChange(year, month + 1);
  };

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} className="h-20" />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const info = dayInfoMap.get(dateStr);
    const isSelected = selectedDate === dateStr;
    const isToday = dateStr === today;
    const isPast = dateStr < today;
    const isFull = info ? info.available_slots === 0 : false;
    const isClickable = !!info && !isPast && !isFull;

    const colors = info ? getOccupancyColor(info.occupancy_percent) : null;

    let cellClass = 'h-20 flex flex-col items-center justify-center rounded-xl text-sm font-medium transition relative ';

    if (isPast) {
      cellClass += 'text-gray-300 cursor-not-allowed';
    } else if (isSelected) {
      cellClass += 'bg-blue-600 text-white ring-2 ring-blue-600 ring-offset-2 cursor-pointer';
    } else if (isFull && colors) {
      cellClass += `${colors.bg} ${colors.text} border ${colors.border} cursor-not-allowed`;
    } else if (info && colors) {
      cellClass += `${colors.bg} ${colors.text} border ${colors.border} hover:shadow-md cursor-pointer`;
    } else {
      cellClass += 'text-gray-300 cursor-not-allowed';
    }

    cells.push(
      <div
        key={dateStr}
        className={cellClass}
        onClick={() => isClickable ? onSelectDate(dateStr) : undefined}
      >
        <span className={isToday && !isSelected ? 'bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 text-xs font-bold' : ''}>
          {day}
        </span>
        {info && !isSelected && !isPast && (
          <div className="flex flex-col items-center gap-0.5 mt-1">
            <span className={`inline-block h-2 w-2 rounded-full ${colors!.dot}`} />
            <span className={`text-[10px] leading-none font-medium ${colors!.text}`}>
              {isFull ? t('booking.full') : `${info.available_slots} ${t('booking.slotsLeft', { count: info.available_slots })}`}
            </span>
          </div>
        )}
        {isSelected && info && (
          <span className="text-[10px] leading-none mt-1 text-blue-100">
            {info.available_slots} {t('booking.slotsLeft', { count: info.available_slots })}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <button onClick={prevMonth} className="rounded-lg p-2 hover:bg-gray-100 transition">
          <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-lg font-bold text-gray-900">
          {MONTH_NAMES[month]} {year}
        </h3>
        <button onClick={nextMonth} className="rounded-lg p-2 hover:bg-gray-100 transition">
          <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> {t('booking.legendOpen')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" /> {t('booking.legendModerate')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> {t('booking.legendBusy')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" /> {t('booking.legendAlmostFull')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> {t('booking.legendFull')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-200" /> {t('booking.notAvailable')}
        </span>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2">{d}</div>
        ))}
        {loading ? (
          <div className="col-span-7 py-12 text-center text-gray-400">{t('common.loading')}</div>
        ) : (
          cells
        )}
      </div>

      {!loading && availableDays.length === 0 && (
        <p className="mt-4 text-center text-sm text-gray-500">{t('booking.noDays')}</p>
      )}
    </div>
  );
}
