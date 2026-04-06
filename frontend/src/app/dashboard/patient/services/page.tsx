'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import ServiceList from '@/components/ServiceList';

export default function PatientServicesPage() {
  const { user, loading } = useAuth();
  const t = useTranslations();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && user.user_type !== 'Patient') router.push('/dashboard');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h2 className="mb-6 text-2xl font-bold text-gray-900">{t('services.title')}</h2>
      <ServiceList showBookButton={false} clickable={true} />
    </div>
  );
}
