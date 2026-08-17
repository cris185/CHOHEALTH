'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TimeSlot, ScheduleBlock } from '@/lib/api';

const ROW_HEIGHT = 72;

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

function minToTimeStr(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const REASON_MESSAGES: Record<string, string> = {
  break: 'This slot overlaps with the doctor\'s break period.',
  shift_end: 'The service duration extends beyond the doctor\'s working hours.',
  booked: 'This slot is already booked.',
  past: 'This slot is in the past.',
};

export default function PatientDayTimeline({
  date, slots, schedules, serviceDuration, selectedSlot, onSelectSlot, loading,
}: PatientDayTimelineProps) {
  const t = useTranslations();
  const [toast, setToast] = useState<string | null>(null);

  const formattedDate = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const slotMap = useMemo(() => {
    const m = new Map<string, TimeSlot>();
    for (const s of slots) m.set(s.time, s);
    return m;
  }, [slots]);

  const scheduleStartMin = useMemo(
    () => (schedules.length ? Math.min(...schedules.map((s) => timeToMinutes(s.start_time))) : 0),
    [schedules],
  );
  const scheduleEndMin = useMemo(
    () => (schedules.length ? Math.max(...schedules.map((s) => timeToMinutes(s.end_time))) : 0),
    [schedules],
  );

  const breakRanges = useMemo(
    () =>
      schedules
        .filter((s) => s.break_start && s.break_end)
        .map((s) => ({
          startMin: timeToMinutes(s.break_start!),
          endMin: timeToMinutes(s.break_end!),
        })),
    [schedules],
  );

  const isInBreak = (min: number) =>
    breakRanges.some((br) => min >= br.startMin && min < br.endMin);

  /**
   * Build rows: one row per HOUR. Each row has two half-hour cells
   * (the :00 half and the :30 half).
   */
  interface HourRow {
    hourMin: number; // e.g. 420 for 7:00 AM
    firstHalf: CellData;
    secondHalf: CellData;
  }

  interface CellData {
    startMin: number;
    slot: TimeSlot | null;
    isBreak: boolean;
    /** True when this cell is outside the schedule range (filler). */
    isOutside: boolean;
  }

  const hourRows: HourRow[] = useMemo(() => {
    const firstHour = Math.floor(scheduleStartMin / 60) * 60;
    const lastHour = Math.ceil(scheduleEndMin / 60) * 60;
    const rows: HourRow[] = [];

    for (let h = firstHour; h < lastHour; h += 60) {
      const firstMin = h;
      const secondMin = h + 30;

      const makeCell = (m: number): CellData => {
        const outside = m < scheduleStartMin || m >= scheduleEndMin;
        return {
          startMin: m,
          slot: slotMap.get(minToTimeStr(m)) || null,
          isBreak: isInBreak(m),
          isOutside: outside,
        };
      };

      rows.push({
        hourMin: h,
        firstHalf: makeCell(firstMin),
        secondHalf: makeCell(secondMin),
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleStartMin, scheduleEndMin, slotMap, breakRanges]);

  const handleCellClick = (cell: CellData) => {
    if (cell.isOutside || cell.isBreak) return;
    if (!cell.slot) return;
    if (cell.slot.available) {
      onSelectSlot(cell.slot.time);
    } else {
      const reason = cell.slot.unavailable_reason || 'booked';
      showToast(REASON_MESSAGES[reason] || REASON_MESSAGES.booked);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-gray-200 rounded" />
          <div className="space-y-0 mt-6 border border-gray-200 rounded-lg overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[72px] bg-gray-50 border-b border-gray-100" />
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

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{formattedDate}</h3>
      <p className="text-sm text-gray-500 mb-2">
        {minutesToLabel(scheduleStartMin)} - {minutesToLabel(scheduleEndMin)} &middot;{' '}
        {serviceDuration} min per appointment
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

      {/* Toast */}
      {toast && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {toast}
        </div>
      )}

      {/* Grid */}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="w-20 border-r border-b border-gray-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Time
              </th>
              <th
                colSpan={2}
                className="border-b border-gray-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500"
              >
                Schedule
              </th>
            </tr>
          </thead>
          <tbody>
            {hourRows.map((row) => (
              <tr key={row.hourMin} className="border-b border-gray-200 last:border-b-0">
                {/* Time label */}
                <td
                  className="border-r border-gray-200 px-3 text-[11px] font-medium text-gray-400 align-middle text-center"
                  style={{ height: `${ROW_HEIGHT}px` }}
                >
                  {minutesToLabel(row.hourMin)}
                </td>

                {/* First half (:00 – :29) */}
                <HalfCell
                  cell={row.firstHalf}
                  serviceDuration={serviceDuration}
                  selectedSlot={selectedSlot}
                  onClick={handleCellClick}
                  t={t}
                />

                {/* Second half (:30 – :59) */}
                <HalfCell
                  cell={row.secondHalf}
                  serviceDuration={serviceDuration}
                  selectedSlot={selectedSlot}
                  onClick={handleCellClick}
                  t={t}
                  isSecondHalf
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Half-hour cell renderer
// ============================================================================

interface CellData {
  startMin: number;
  slot: TimeSlot | null;
  isBreak: boolean;
  isOutside: boolean;
}

function HalfCell({
  cell,
  serviceDuration,
  selectedSlot,
  onClick,
  t,
  isSecondHalf,
}: {
  cell: CellData;
  serviceDuration: number;
  selectedSlot: string | null;
  onClick: (cell: CellData) => void;
  t: ReturnType<typeof useTranslations>;
  isSecondHalf?: boolean;
}) {
  const endMin = cell.startMin + serviceDuration;
  const isSelected = selectedSlot === cell.slot?.time;

  const baseTd = `p-1 align-middle ${isSecondHalf ? '' : 'border-r border-gray-100'}`;

  // Outside schedule range
  if (cell.isOutside) {
    return (
      <td className={`${baseTd} bg-gray-50/50`} style={{ height: `${ROW_HEIGHT}px` }} />
    );
  }

  // Break
  if (cell.isBreak) {
    return (
      <td className={`${baseTd} bg-yellow-50`} style={{ height: `${ROW_HEIGHT}px` }}>
        <div className="flex h-full items-center justify-center rounded-md border border-yellow-200 bg-yellow-50">
          <div className="text-center">
            <span className="text-[10px] font-semibold text-yellow-600">{t('booking.break')}</span>
            <span className="block text-[9px] text-yellow-500">
              {minutesToLabel(cell.startMin)}
            </span>
          </div>
        </div>
      </td>
    );
  }

  // Available
  if (cell.slot?.available) {
    return (
      <td className={baseTd} style={{ height: `${ROW_HEIGHT}px` }}>
        <button
          type="button"
          onClick={() => onClick(cell)}
          className={`flex h-full w-full items-center justify-center rounded-md transition-all ${
            isSelected
              ? 'bg-blue-600 border-2 border-blue-700 ring-2 ring-blue-300 shadow-lg'
              : 'bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 hover:shadow-sm'
          }`}
        >
          <div className="text-center px-1">
            <span
              className={`text-[10px] font-semibold ${isSelected ? 'text-white' : 'text-emerald-700'}`}
            >
              {t('booking.available')}
            </span>
            <span
              className={`block text-[9px] ${isSelected ? 'text-blue-100' : 'text-emerald-600'}`}
            >
              {minutesToLabel(cell.startMin)} - {minutesToLabel(endMin)}
            </span>
          </div>
        </button>
      </td>
    );
  }

  // Unavailable — differentiate between reasons:
  //   - break / shift_end: the service simply doesn't fit here, so we render
  //     the cell as EMPTY (no block) to avoid a confusing gray card next to
  //     an available one in the same hour row.
  //   - booked / past: these are real blockers worth showing visually.
  if (cell.slot && !cell.slot.available) {
    const reason = cell.slot.unavailable_reason;

    // Break conflict or shift overflow → empty cell, no visual block.
    if (reason === 'break' || reason === 'shift_end') {
      return <td className={`${baseTd} bg-gray-50/30`} style={{ height: `${ROW_HEIGHT}px` }} />;
    }

    const label = reason === 'past' ? 'Past' : cell.slot.is_booked ? t('booking.booked') : 'Unavailable';

    return (
      <td className={baseTd} style={{ height: `${ROW_HEIGHT}px` }}>
        <div
          onClick={() => onClick(cell)}
          className="flex h-full w-full cursor-pointer items-center justify-center rounded-md bg-gray-100 border border-gray-200 hover:bg-gray-150 transition-colors"
        >
          <div className="text-center px-1">
            <span className="text-[10px] font-medium text-gray-400">{label}</span>
            <span className="block text-[9px] text-gray-400">
              {minutesToLabel(cell.startMin)}
            </span>
          </div>
        </div>
      </td>
    );
  }

  // Empty (no slot data)
  return <td className={baseTd} style={{ height: `${ROW_HEIGHT}px` }} />;
}
