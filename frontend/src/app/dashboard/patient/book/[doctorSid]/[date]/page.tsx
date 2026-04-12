'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { doctors as doctorsApi, services as servicesApi, Service, DayAvailability } from '@/lib/api';
import PatientDayTimeline from '@/components/booking/PatientDayTimeline';
import BookingModal from '@/components/booking/BookingModal';
import { useBfcacheRefetch } from '@/hooks/useBfcacheRefetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

export default function DayBookingPage() {
  const { doctorSid, date } = useParams<{ doctorSid: string; date: string }>();
  const searchParams = useSearchParams();
  const serviceSid = searchParams.get('service') || '';
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();

  const [service, setService] = useState<Service | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<Service['doctors'][0] | null>(null);
  const [dayData, setDayData] = useState<DayAvailability | null>(null);
  const [dayLoading, setDayLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const slotsAbortRef = useRef<AbortController | null>(null);

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

  // Load day slots (con cancelación explícita para evitar que un fetch
  // abortado por el unload a Stripe/PayPal deje la UI en loading eterno
  // cuando la página es restaurada desde el bfcache).
  const loadSlots = useCallback(() => {
    if (!doctorSid || !serviceSid || !date) return;
    slotsAbortRef.current?.abort();
    const controller = new AbortController();
    slotsAbortRef.current = controller;

    setDayLoading(true);
    doctorsApi.availableSlots(doctorSid, date, serviceSid, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setDayData(data); })
      .catch((err: unknown) => {
        const name = (err as { name?: string })?.name;
        if (name === 'AbortError') return;
        if (!controller.signal.aborted) setDayData(null);
      })
      .finally(() => { if (!controller.signal.aborted) setDayLoading(false); });
  }, [doctorSid, serviceSid, date]);

  useEffect(() => {
    loadSlots();
    return () => slotsAbortRef.current?.abort();
  }, [loadSlots]);

  // Al volver del bfcache (botón "atrás" desde Stripe/PayPal), refresca los
  // slots: el backend pudo haber cambiado mientras el usuario estaba fuera,
  // y además así garantizamos que `dayLoading` quede en false aunque el
  // navegador restaurara el estado a medio cargar.
  useBfcacheRefetch(loadSlots);

  const handleSlotSelect = (time: string) => {
    setSelectedSlot(time);
    setModalOpen(true);
  };

  if (authLoading || !user || !service || !selectedDoctor) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  const doctorImage = selectedDoctor.image
    ? selectedDoctor.image.startsWith('http') ? selectedDoctor.image : `${API_BASE}${selectedDoctor.image}`
    : null;

  const summary = dayData?.summary;
  const occupancyPercent = summary?.occupancy_percent ?? 0;

  // Occupancy bar color
  function getBarColor(percent: number): string {
    if (percent >= 100) return 'bg-red-500';
    if (percent >= 75) return 'bg-orange-500';
    if (percent >= 50) return 'bg-amber-500';
    if (percent >= 25) return 'bg-blue-500';
    return 'bg-emerald-500';
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Back to calendar */}
        <Link
          href={`/dashboard/patient/book/${doctorSid}?service=${serviceSid}`}
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-500 mb-6"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t('booking.backToCalendar')}
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('booking.selectTime')}</h1>

        {/* Doctor + Service Info */}
        <div className="mb-6 flex items-center gap-4 rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          {doctorImage ? (
            <img src={doctorImage} alt={selectedDoctor.full_name} className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
              <svg className="h-7 w-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900">Dr. {selectedDoctor.full_name}</h2>
            <p className="text-sm text-gray-500">{selectedDoctor.specialization}</p>
            <p className="text-sm text-gray-500">{service.name} &middot; {service.duration_minutes} min &middot; ${service.cost}</p>
          </div>
        </div>

        {/* Occupancy Progress Bar */}
        {summary && !dayLoading && (
          <div className="mb-6 rounded-xl bg-white p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                {t('booking.occupancyBar', { available: summary.available_slots, total: summary.total_slots })}
              </span>
              <span className={`text-sm font-bold ${occupancyPercent >= 75 ? 'text-orange-600' : occupancyPercent >= 50 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {occupancyPercent}% {occupancyPercent >= 100 ? t('booking.full') : t('booking.occupied', { percent: '' }).replace(' ', '')}
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getBarColor(occupancyPercent)}`}
                style={{ width: `${Math.min(occupancyPercent, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Timeline */}
        <PatientDayTimeline
          date={date}
          slots={dayData?.slots || []}
          schedules={dayData?.schedules || []}
          serviceDuration={service.duration_minutes}
          selectedSlot={selectedSlot}
          onSelectSlot={handleSlotSelect}
          loading={dayLoading}
        />

        {/* Booking Modal */}
        <BookingModal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setSelectedSlot(null); }}
          doctorSid={doctorSid}
          serviceSid={serviceSid}
          date={date}
          time={selectedSlot || ''}
          doctorName={`Dr. ${selectedDoctor.full_name}`}
          serviceName={service.name}
          serviceDuration={service.duration_minutes}
          serviceCost={service.cost}
        />
      </main>
    </div>
  );
}
