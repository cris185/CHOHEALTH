'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { doctors as doctorsApi, services as servicesApi, Service, DayInfo } from '@/lib/api';
import MonthCalendar from '@/components/booking/MonthCalendar';
import InitialsAvatar, { resolveImageUrl } from '@/components/InitialsAvatar';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

export default function BookingPage() {
  const { doctorSid } = useParams<{ doctorSid: string }>();
  const searchParams = useSearchParams();
  const serviceSid = searchParams.get('service') || '';
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();

  const [service, setService] = useState<Service | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<Service['doctors'][0] | null>(null);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [availableDays, setAvailableDays] = useState<DayInfo[]>([]);
  const [calLoading, setCalLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    if (!authLoading && user && user.user_type !== 'Patient') router.push('/dashboard');
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load service + find doctor
  useEffect(() => {
    if (serviceSid) {
      servicesApi.detail(serviceSid).then((s) => {
        setService(s);
        const doc = s.doctors.find((d) => d.sid === doctorSid);
        if (doc) setSelectedDoctor(doc);
      }).catch(() => router.push('/dashboard/patient'));
    }
  }, [serviceSid, doctorSid, router]);

  // Load available days when month changes
  useEffect(() => {
    if (doctorSid && serviceSid) {
      setCalLoading(true);
      const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
      doctorsApi.availableDays(doctorSid, monthStr, { serviceSid })
        .then(setAvailableDays)
        .catch(() => setAvailableDays([]))
        .finally(() => setCalLoading(false));
    }
  }, [doctorSid, serviceSid, calYear, calMonth]);

  // Navigate to day timeline when a date is selected
  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    router.push(`/dashboard/patient/book/${doctorSid}/${date}?service=${serviceSid}`);
  };

  const handleMonthChange = (year: number, month: number) => {
    setCalYear(year);
    setCalMonth(month);
    setSelectedDate(null);
  };

  if (authLoading || !user || !service || !selectedDoctor) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  const doctorImage = resolveImageUrl(selectedDoctor.image, API_BASE);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href={`/dashboard/patient/services/${serviceSid}`}
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-500 mb-6">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t('booking.backToService')}
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('booking.title')}</h1>

        {/* Doctor + Service Info */}
        <div className="mb-8 flex items-center gap-4 rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <InitialsAvatar
            src={doctorImage}
            name={selectedDoctor.full_name}
            mode="person"
            shape="circle"
            variant="blue"
            className="h-16 w-16"
            textClassName="text-lg"
          />
          <div>
            <h2 className="font-semibold text-gray-900">Dr. {selectedDoctor.full_name}</h2>
            <p className="text-sm text-gray-500">{selectedDoctor.specialization}</p>
            <p className="text-sm text-gray-500">{service.name} &middot; {service.duration_minutes} min &middot; ${service.cost}</p>
          </div>
        </div>

        {/* Calendar — full width */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-gray-700">{t('booking.selectDate')}</h3>
          <MonthCalendar
            year={calYear}
            month={calMonth}
            availableDays={availableDays}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            onMonthChange={handleMonthChange}
            loading={calLoading}
          />
          <p className="mt-3 text-center text-xs text-gray-400">{t('booking.clickToView')}</p>
        </div>
      </main>
    </div>
  );
}
