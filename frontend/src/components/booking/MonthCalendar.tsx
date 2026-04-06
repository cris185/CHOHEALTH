'use client';

import { useTranslations } from 'next-intl';

interface MonthCalendarProps {
  year: number;
  month: number;
  availableDays: string[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onMonthChange: (year: number, month: number) => void;
  loading?: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function MonthCalendar({
  year, month, availableDays, selectedDate, onSelectDate, onMonthChange, loading,
}: MonthCalendarProps) {
  const t = useTranslations();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

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
    cells.push(<div key={`empty-${i}`} className="h-14" />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isAvailable = availableDays.includes(dateStr);
    const isSelected = selectedDate === dateStr;
    const isToday = dateStr === today;
    const isPast = dateStr < today;

    let cellClass = 'h-14 flex items-center justify-center rounded-lg text-sm font-medium transition ';

    if (isPast) {
      cellClass += 'text-gray-300 cursor-not-allowed';
    } else if (isSelected) {
      cellClass += 'bg-blue-600 text-white ring-2 ring-blue-600 ring-offset-2 cursor-pointer';
    } else if (isAvailable) {
      cellClass += 'bg-green-50 text-green-700 hover:bg-green-100 cursor-pointer border border-green-200';
    } else {
      cellClass += 'text-gray-400 cursor-not-allowed';
    }

    cells.push(
      <div
        key={dateStr}
        className={cellClass}
        onClick={() => isAvailable && !isPast ? onSelectDate(dateStr) : undefined}
      >
        <div className="text-center">
          <span className={isToday ? 'bg-blue-100 text-blue-700 rounded-full px-2 py-0.5' : ''}>
            {day}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={prevMonth} className="rounded p-2 hover:bg-gray-100">
          <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-lg font-semibold text-gray-900">
          {MONTH_NAMES[month]} {year}
        </h3>
        <button onClick={nextMonth} className="rounded p-2 hover:bg-gray-100">
          <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="mb-1 flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-green-100 border border-green-200" /> {t('booking.available')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-gray-100" /> Not available
        </span>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>
        ))}
        {loading ? (
          <div className="col-span-7 py-8 text-center text-gray-400">{t('common.loading')}</div>
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
