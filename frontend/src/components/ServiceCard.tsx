'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Service } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Clock, ArrowRight } from 'lucide-react';

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
        <div className="w-full overflow-hidden bg-muted">
          <img src={imageUrl} alt={service.name} className="w-full object-contain" />
        </div>
      ) : (
        <div className="flex h-48 w-full items-center justify-center bg-gradient-to-br from-primary/80 to-primary">
          <svg className="h-16 w-16 text-primary-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </div>
      )}

      <CardContent className="p-5">
        <h3 className="text-lg font-bold">{service.name}</h3>
        {service.description && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{service.description}</p>
        )}

        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{t('services.doctorsAvailable')}: {service.doctors_count}</span>
        </div>

        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{service.duration_minutes} {t('services.duration')}</span>
        </div>

        <p className="mt-3 text-2xl font-bold">${service.cost}</p>

        {showBookButton && !clickable && (
          <Link href="/login" className="mt-4 block">
            <Button className="w-full">
              {t('services.bookAppointment')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        )}
      </CardContent>
    </>
  );

  if (clickable) {
    return (
      <Link href={`/dashboard/patient/services/${service.sid}`}>
        <Card className="overflow-hidden transition-all hover:shadow-md hover:border-primary/50 cursor-pointer">
          {cardContent}
        </Card>
      </Link>
    );
  }

  return (
    <Card className="overflow-hidden">
      {cardContent}
    </Card>
  );
}
