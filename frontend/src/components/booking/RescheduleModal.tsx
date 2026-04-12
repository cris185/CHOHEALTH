'use client';

import { useEffect, useMemo, useState } from 'react';
import { doctors as doctorsApi, DayInfo, DayAvailability } from '@/lib/api';

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
 * Calls the existing /doctors/<sid>/available-days and /available-slots endpoints.
 * `onReschedule` is the function the caller uses to hit their own endpoint (patient or doctor).
 */
export default function RescheduleModal({
  isOpen, onClose, appointmentSid, doctorSid, serviceSid, currentDate, onReschedule, title,
}: RescheduleModalProps) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [days, setDays] = useState<DayInfo[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [daySlots, setDaySlots] = useState<DayAvailability | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const currentMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [monthOffset]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setMonthOffset(0);
      setDays([]);
      setSelectedDate('');
      setDaySlots(null);
      setSelectedTime('');
      setError('');
    }
  }, [isOpen]);

  // Load available days when modal opens or month changes
  useEffect(() => {
    if (!isOpen || !doctorSid || !serviceSid) return;
    setLoading(true);
    setError('');
    doctorsApi.availableDays(doctorSid, currentMonth, serviceSid)
      .then(setDays)
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, [isOpen, currentMonth, doctorSid, serviceSid]);

  // Load slots when a date is selected
  useEffect(() => {
    if (!selectedDate || !doctorSid || !serviceSid) {
      setDaySlots(null);
      return;
    }
    setLoading(true);
    doctorsApi.availableSlots(doctorSid, selectedDate, serviceSid)
      .then(setDaySlots)
      .catch(() => setDaySlots(null))
      .finally(() => setLoading(false));
  }, [selectedDate, doctorSid, serviceSid]);

  if (!isOpen) return null;

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
      setError(apiError?.data?.detail || 'Could not reschedule the appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentDateFormatted = new Date(currentDate).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title || 'Reschedule Appointment'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Current: {currentDateFormatted}</p>
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
              This appointment cannot be rescheduled (missing doctor or service).
            </div>
          ) : (
            <>
              {/* Month navigator */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMonthOffset((m) => Math.max(0, m - 1))}
                  disabled={monthOffset === 0}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  ← Prev
                </button>
                <p className="text-sm font-semibold">{new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                <button
                  type="button"
                  onClick={() => setMonthOffset((m) => m + 1)}
                  className="rounded-md border px-3 py-1.5 text-sm"
                >
                  Next →
                </button>
              </div>

              {/* Days grid */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Available days</p>
                {loading && !daySlots ? (
                  <div className="grid grid-cols-7 gap-2">
                    {[...Array(14)].map((_, i) => <div key={i} className="h-12 rounded-md bg-gray-100 animate-pulse" />)}
                  </div>
                ) : days.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">No available days this month.</p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {days.map((d) => {
                      const dateObj = new Date(d.date + 'T00:00:00');
                      const isSelected = selectedDate === d.date;
                      const isFull = d.available_slots === 0;
                      return (
                        <button
                          key={d.date}
                          type="button"
                          onClick={() => { setSelectedDate(d.date); setSelectedTime(''); }}
                          disabled={isFull}
                          className={`rounded-md border-2 p-2 text-center transition ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50'
                              : isFull
                                ? 'border-gray-200 bg-gray-50 opacity-50'
                                : 'border-gray-200 hover:border-blue-400'
                          }`}
                        >
                          <p className="text-[10px] uppercase text-gray-500">{dateObj.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                          <p className="text-sm font-bold text-gray-900">{dateObj.getDate()}</p>
                          <p className="text-[9px] text-gray-500">{d.available_slots} free</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Time slots */}
              {selectedDate && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Available times</p>
                  {loading ? (
                    <div className="grid grid-cols-4 gap-2">
                      {[...Array(8)].map((_, i) => <div key={i} className="h-8 rounded-md bg-gray-100 animate-pulse" />)}
                    </div>
                  ) : !daySlots || daySlots.slots.length === 0 ? (
                    <p className="text-sm text-gray-500 py-2">No slots available on this day.</p>
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
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedDate || !selectedTime || submitting}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Rescheduling…' : 'Confirm Reschedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
