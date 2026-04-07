'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { services as servicesApi, Service } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

function getImageUrl(image: string | null) {
  if (!image) return null;
  return image.startsWith('http') ? image : `${API_BASE}${image}`;
}

export default function ServiceDetailPage() {
  const { sid } = useParams<{ sid: string }>();
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    if (!authLoading && user && user.user_type !== 'Patient') router.push('/dashboard');
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sid) {
      servicesApi.detail(sid)
        .then(setService)
        .catch(() => router.push('/dashboard/patient'))
        .finally(() => setLoading(false));
    }
  }, [sid, router]);

  if (loading || authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  if (!service) return null;

  const serviceImage = getImageUrl(service.image);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Link href="/dashboard/patient" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-500 mb-6">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t('services.back')}
        </Link>

        {/* Service Info */}
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            {serviceImage ? (
              <div className="overflow-hidden rounded-lg bg-gray-200">
                <img src={serviceImage} alt={service.name} className="w-full object-contain" />
              </div>
            ) : (
              <div className="flex h-64 w-full items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700">
                <svg className="h-20 w-20 text-white opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
            )}
          </div>

          <div>
            <h1 className="text-3xl font-bold text-gray-900">{service.name}</h1>
            {service.description && (
              <p className="mt-4 text-gray-600">{service.description}</p>
            )}

            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-500">{t('services.price')}:</span>
                <span className="text-3xl font-bold text-gray-900">${service.cost}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-500">{t('services.durationLabel')}:</span>
                <span className="text-gray-900">{service.duration_minutes} {t('services.duration')}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-500">{t('services.doctorsAvailable')}:</span>
                <span className="text-gray-900">{service.doctors_count}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Available Doctors */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900">{t('services.availableDoctors')}</h2>

          {service.doctors.length === 0 ? (
            <p className="mt-4 text-gray-500">{t('services.noDoctors')}</p>
          ) : (
            <div className="mt-6 space-y-4">
              {service.doctors.map((doctor) => {
                const doctorImage = getImageUrl(doctor.image);
                return (
                  <div key={doctor.sid} className="flex items-center justify-between rounded-lg bg-white p-6 shadow">
                    <div className="flex items-center gap-4">
                      {doctorImage ? (
                        <img src={doctorImage} alt={doctor.full_name} className="h-14 w-14 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
                          <svg className="h-7 w-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-gray-900">Dr. {doctor.full_name}</h3>
                        <p className="text-sm text-gray-500">{doctor.specialization} &middot; {doctor.years_of_experience} {t('services.experience')}</p>
                        <p className="text-sm text-gray-500">
                          <span className="font-medium">{t('services.nextAvailable')}:</span>{' '}
                          {doctor.next_available_appointment_date
                            ? new Date(doctor.next_available_appointment_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : t('services.notAvailable')
                          }
                        </p>
                      </div>
                    </div>

                    <Link href={`/dashboard/patient/book/${doctor.sid}?service=${service.sid}`}
                      className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
                      {t('services.bookNow')}
                      <svg className="ml-2 inline h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
