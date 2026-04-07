'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { services as servicesApi, Service } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import ServiceCard from './ServiceCard';

interface ServiceListProps {
  showBookButton?: boolean;
  clickable?: boolean;
}

export default function ServiceList({ showBookButton = true, clickable = false }: ServiceListProps) {
  const t = useTranslations();
  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    servicesApi.list()
      .then(setServicesList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (servicesList.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {t('services.noServices')}
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {servicesList.map((service) => (
        <ServiceCard key={service.sid} service={service} showBookButton={showBookButton} clickable={clickable} />
      ))}
    </div>
  );
}
