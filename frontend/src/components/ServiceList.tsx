'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { services as servicesApi, Service } from '@/lib/api';
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
      <div className="text-center py-8">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  if (servicesList.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">{t('services.noServices')}</p>
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