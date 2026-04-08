'use client';

import { useAuth } from '@/context/AuthContext';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardRedirect() {
  const { user, loading } = useAuth();
  const t = useTranslations();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/login');
    } else if (user.user_type === 'Doctor') {
      router.push('/dashboard/doctor');
    } else if (user.user_type === 'Superuser') {
      window.location.href = '/admin/';
    } else {
      router.push('/dashboard/patient');
    }
  }, [user, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-500">{t('common.loading')}</p>
    </div>
  );
}