'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { doctors as doctorsApi, DayInfo, DayAvailability } from '@/lib/api';
import MonthCalendar from './MonthCalendar';

interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentSid: string;
  doctorSid: string | null;
  serviceSid: string | null;
  currentDate: string;
  onReschedule: (sid: string, dateTimeIso: string) => Promise<void>;
  title?: string;
}

/**
 * Reusable modal to pick a new date + time for an existing appointment.
 * Shares `MonthCalendar` with the booking flow so the UX matches between
 * "book a service" and "reschedule".
 */
export default function RescheduleModal({
  isOpen, onClose, appointmentSid, doctorSid, serviceSid, currentDate, onReschedule, title,
}: RescheduleModalProps) {
  const t = useTranslations();
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [days, setDays] = useState<DayInfo[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [daySlots, setDaySlots] = useState<DayAvailability | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [calLoading, setCalLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      const today = new Date();
      setCalYear(today.getFullYear());
      setCalMonth(today.getMonth());
      setDays([]);
      setSelectedDate(null);
      setDaySlots(null);
      setSelectedTime('');
      setError('');
    }
  }, [isOpen]);

  // Load available days when modal opens or month changes
  useEffect(() => {
    if (!isOpen || !doctorSid || !serviceSid) return;
    setCalLoading(true);
    setError('');
    const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
    doctorsApi.availableDays(doctorSid, monthStr, { serviceSid })
      .then(setDays)
      .catch(() => setDays([]))
      .finally(() => setCalLoading(false));
  }, [isOpen, calYear, calMonth, doctorSid, serviceSid]);

  // Load slots when a date is selected
  useEffect(() => {
    if (!selectedDate || !doctorSid || !serviceSid) {
      setDaySlots(null);
      return;
    }
    setSlotsLoading(true);
    doctorsApi.availableSlots(doctorSid, selectedDate, { serviceSid })
      .then(setDaySlots)
      .catch(() => setDaySlots(null))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, doctorSid, serviceSid]);

  if (!isOpen) return null;

  const handleMonthChange = (year: number, month: number) => {
    setCalYear(year);
    setCalMonth(month);
    setSelectedDate(null);
    setSelectedTime('');
  };

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedTime('');
  };

  const handleConfirm = async () => {
    if (!selectedDate || !selectedTime) return;
    setSubmitting(true);
    setError('');
    try {
      const dateTimeIso = `${selectedDate}T${selectedTime}:00`;
      await onReschedule(appointmentSid, dateTimeIso);
      onClose();
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string } };
      setError(apiError?.data?.detail || t('booking.rescheduleError'));
    } finally {
      setSubmitting(false);
    }
  };

  const currentDateFormatted = new Date(currentDate).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title || t('booking.rescheduleTitle')}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{t('booking.currentLabel')}: {currentDateFormatted}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && <div className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          {!doctorSid || !serviceSid ? (
            <div className="py-8 text-center text-sm text-gray-500">
              {t('booking.cannotReschedule')}
            </div>
          ) : (
            <>
              <MonthCalendar
                year={calYear}
                month={calMonth}
                availableDays={days}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                onMonthChange={handleMonthChange}
                loading={calLoading}
              />

              {selectedDate && (
                <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <p className="mb-2 text-xs font-medium text-gray-600">{t('booking.availableTimes')}</p>
                  {slotsLoading ? (
                    <div className="grid grid-cols-4 gap-2">
                      {[...Array(8)].map((_, i) => <div key={i} className="h-8 rounded-md bg-gray-100 animate-pulse" />)}
                    </div>
                  ) : !daySlots || daySlots.slots.length === 0 ? (
                    <p className="text-sm text-gray-500 py-2">{t('booking.noSlotsThisDay')}</p>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {daySlots.slots.filter((s) => !s.is_break).map((slot) => {
                        const isSelected = selectedTime === slot.time;
                        const disabled = !slot.available;
                        return (
                          <button
                            key={slot.time}
                            type="button"
                            onClick={() => !disabled && setSelectedTime(slot.time)}
                            disabled={disabled}
                            className={`rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                              isSelected
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : disabled
                                  ? 'border-gray-200 bg-gray-50 text-gray-400 line-through cursor-not-allowed'
                                  : 'border-gray-300 text-gray-700 hover:border-blue-400'
                            }`}
                          >
                            {slot.time}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t p-4 flex gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('booking.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedDate || !selectedTime || submitting}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? t('booking.rescheduling') : t('booking.confirmReschedule')}
          </button>
        </div>
      </div>
    </div>
  );
}
