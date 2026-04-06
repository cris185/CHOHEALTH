'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Service } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

interface ServiceCardProps {
  service: Service;
  showBookButton?: boolean;
  clickable?: boolean;
}

export default function ServiceCard({ service, showBookButton = true, clickable = false }: ServiceCardProps) {
  const t = useTranslations();

  const imageUrl = service.image
    ? service.image.startsWith('http') ? service.image : `${API_BASE}${service.image}`
    : null;

  const cardContent = (
    <>
      {imageUrl ? (
        <div className="w-full overflow-hidden bg-gray-200">
          <img src={imageUrl} alt={service.name} className="w-full object-contain" />
        </div>
      ) : (
        <div className="flex h-48 w-full items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700">
          <svg className="h-16 w-16 text-white opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </div>
      )}

      <div className="p-5">
        <h3 className="text-lg font-bold text-gray-900">{service.name}</h3>
        {service.description && (
          <p className="mt-1 text-sm text-gray-500 line-clamp-2">{service.description}</p>
        )}

        <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span>{t('services.doctorsAvailable')}: {service.doctors_count}</span>
        </div>

        <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{service.duration_minutes} {t('services.duration')}</span>
        </div>

        <p className="mt-3 text-2xl font-bold text-gray-900">${service.cost}</p>

        {showBookButton && !clickable && (
          <Link
            href="/login"
            className="mt-4 flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t('services.bookAppointment')}
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        )}
      </div>
    </>
  );

  if (clickable) {
    return (
      <Link href={`/dashboard/patient/services/${service.sid}`}
        className="block overflow-hidden rounded-lg bg-white shadow transition hover:shadow-lg cursor-pointer">
        {cardContent}
      </Link>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow transition hover:shadow-lg">
      {cardContent}
    </div>
  );
}