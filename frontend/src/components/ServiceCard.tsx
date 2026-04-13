'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Service } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Clock, ArrowRight } from 'lucide-react';
import InitialsAvatar, { resolveImageUrl } from '@/components/InitialsAvatar';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

interface ServiceCardProps {
  service: Service;
  showBookButton?: boolean;
  clickable?: boolean;
}

export default function ServiceCard({ service, showBookButton = true, clickable = false }: ServiceCardProps) {
  const t = useTranslations();

  const imageUrl = resolveImageUrl(service.image, API_BASE);

  const cardContent = (
    <>
      {imageUrl ? (
        <div className="flex h-48 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
          <img
            src={imageUrl}
            alt={service.name}
            className="h-full w-full object-cover object-center"
          />
        </div>
      ) : (
        <InitialsAvatar
          src={null}
          name={service.name}
          mode="words"
          shape="square"
          variant="primary"
          className="h-48 w-full"
          textClassName="text-5xl tracking-wider"
        />
      )}

      <CardContent className="flex flex-1 flex-col p-5">
        {/* Title — always two lines tall so cards with short names don't collapse upward */}
        <h3 className="line-clamp-2 min-h-[3.5rem] text-lg font-bold">
          {service.name}
        </h3>
        {service.description && (
          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
            {service.description}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{t('services.doctorsAvailable')}: {service.doctors_count}</span>
        </div>

        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{service.duration_minutes} {t('services.duration')}</span>
        </div>

        {/* Price + button pinned to the bottom so all cards align regardless of title length */}
        <div className="mt-auto pt-3">
          <p className="text-2xl font-bold">${service.cost}</p>
          {showBookButton && !clickable && (
            <Link href="/login" className="mt-4 block">
              <Button className="w-full">
                {t('services.bookAppointment')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </>
  );

  if (clickable) {
    return (
      <Link href={`/dashboard/patient/services/${service.sid}`} className="flex w-full">
        <Card className="flex h-full w-full flex-col overflow-hidden transition-all hover:shadow-md hover:border-primary/50 cursor-pointer">
          {cardContent}
        </Card>
      </Link>
    );
  }

  return (
    <Card className="flex h-full w-full flex-col overflow-hidden">
      {cardContent}
    </Card>
  );
}
