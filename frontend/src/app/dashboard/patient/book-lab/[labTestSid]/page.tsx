'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import {
  doctors as doctorsApi,
  labTestsCatalog,
  LabTestDetail,
  LabStaffItem,
  DayInfo,
  DayAvailability,
} from '@/lib/api';
import MonthCalendar from '@/components/booking/MonthCalendar';
import PatientDayTimeline from '@/components/booking/PatientDayTimeline';
import BookLabModal from '@/components/booking/BookLabModal';
import InitialsAvatar, { resolveImageUrl } from '@/components/InitialsAvatar';
import { useBfcacheRefetch } from '@/hooks/useBfcacheRefetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

/**
 * Lab booking page: pick staff → pick day → pick slot → confirm.
 *
 * One single page (vs the consultation flow which spans two pages) because
 * lab bookings are simpler and there's no second "service detail" step in
 * between. Hash router state keeps the staff/date selection on bfcache restore.
 */
export default function BookLabPage() {
  const { labTestSid } = useParams<{ labTestSid: string }>();
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();

  const [labTest, setLabTest] = useState<LabTestDetail | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<LabStaffItem | null>(null);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [availableDays, setAvailableDays] = useState<DayInfo[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [dayData, setDayData] = useState<DayAvailability | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const slotsAbortRef = useRef<AbortController | null>(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    if (!authLoading && user && user.user_type !== 'Patient') router.push('/dashboard');
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load lab test detail
  useEffect(() => {
    if (!labTestSid) return;
    labTestsCatalog
      .detail(labTestSid)
      .then((data) => {
        setLabTest(data);
        // If the lab has only one staff, auto-pick.
        if (data.staff.length === 1) setSelectedStaff(data.staff[0]);
      })
      .catch(() => router.push('/dashboard/patient/labs'));
  }, [labTestSid, router]);

  // Load available days when staff or month changes
  useEffect(() => {
    if (!selectedStaff || !labTestSid) return;
    setCalLoading(true);
    const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
    doctorsApi
      .availableDays(selectedStaff.sid, monthStr, { labTestSid })
      .then(setAvailableDays)
      .catch(() => setAvailableDays([]))
      .finally(() => setCalLoading(false));
  }, [selectedStaff, labTestSid, calYear, calMonth]);

  // Load day slots
  const loadSlots = useCallback(() => {
    if (!selectedStaff || !labTestSid || !selectedDate) return;
    slotsAbortRef.current?.abort();
    const controller = new AbortController();
    slotsAbortRef.current = controller;

    setDayLoading(true);
    doctorsApi
      .availableSlots(selectedStaff.sid, selectedDate, { labTestSid }, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setDayData(data); })
      .catch((err: unknown) => {
        const name = (err as { name?: string })?.name;
        if (name === 'AbortError') return;
        if (!controller.signal.aborted) setDayData(null);
      })
      .finally(() => { if (!controller.signal.aborted) setDayLoading(false); });
  }, [selectedStaff, labTestSid, selectedDate]);

  useEffect(() => {
    loadSlots();
    return () => slotsAbortRef.current?.abort();
  }, [loadSlots]);

  useBfcacheRefetch(loadSlots);

  const handleSlotSelect = (time: string) => {
    setSelectedSlot(time);
    setModalOpen(true);
  };

  if (authLoading || !user || !labTest) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  const labImage = resolveImageUrl(labTest.image, API_BASE);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link href="/dashboard/patient/labs"
          className="mb-6 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-500">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t('booking.backToLabs') /* fallback to backToService below if missing */}
        </Link>

        <h1 className="mb-6 text-2xl font-bold text-gray-900">{t('booking.title')}</h1>

        {/* Lab info */}
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <InitialsAvatar
            src={labImage}
            name={labTest.name}
            mode="words"
            shape="rounded"
            variant="teal"
            className="h-16 w-16"
            textClassName="text-base"
          />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900">{labTest.name}</h2>
            <p className="text-sm text-gray-500">{labTest.category}</p>
            <p className="text-sm text-gray-500">
              {labTest.duration_minutes} min &middot; ${labTest.cost}
            </p>
          </div>
        </div>

        {/* Staff picker */}
        {labTest.staff.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {t('booking.noLabStaff')}
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium text-gray-700">{t('booking.pickStaff')}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {labTest.staff.map((staff) => {
                  const staffImage = resolveImageUrl(staff.image, API_BASE);
                  const isSelected = selectedStaff?.sid === staff.sid;
                  return (
                    <button
                      key={staff.sid}
                      type="button"
                      onClick={() => {
                        setSelectedStaff(staff);
                        setSelectedDate(null);
                        setDayData(null);
                      }}
                      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-gray-200 bg-white hover:border-primary/30 hover:bg-primary/5'
                      }`}
                    >
                      <InitialsAvatar
                        src={staffImage}
                        name={staff.full_name}
                        mode="person"
                        shape="circle"
                        variant="teal"
                        className="h-10 w-10"
                        textClassName="text-xs"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{staff.full_name}</p>
                        <p className="truncate text-xs text-gray-500">{staff.specialization}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Calendar */}
            {selectedStaff && (
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-medium text-gray-700">{t('booking.selectDate')}</h3>
                <MonthCalendar
                  year={calYear}
                  month={calMonth}
                  availableDays={availableDays}
                  selectedDate={selectedDate}
                  onSelectDate={(date) => setSelectedDate(date)}
                  onMonthChange={(y, m) => { setCalYear(y); setCalMonth(m); setSelectedDate(null); }}
                  loading={calLoading}
                />
              </div>
            )}

            {/* Day timeline */}
            {selectedStaff && selectedDate && (
              <PatientDayTimeline
                date={selectedDate}
                slots={dayData?.slots || []}
                schedules={dayData?.schedules || []}
                serviceDuration={labTest.duration_minutes}
                selectedSlot={selectedSlot}
                onSelectSlot={handleSlotSelect}
                loading={dayLoading}
              />
            )}
          </>
        )}

        {/* Booking modal */}
        {labTest && selectedStaff && selectedDate && (
          <BookLabModal
            isOpen={modalOpen}
            onClose={() => { setModalOpen(false); setSelectedSlot(null); }}
            labTest={labTest}
            staff={selectedStaff}
            date={selectedDate}
            time={selectedSlot || ''}
          />
        )}
      </main>
    </div>
  );
}
