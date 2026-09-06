'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import ThreadList from '@/components/messaging/ThreadList';
import { MessageCircle } from 'lucide-react';

export default function PatientMessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations('dashboard.patient.messagesPage');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <MessageCircle className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
      </div>
      <ThreadList basePath="/dashboard/patient/messages" i18nNamespace="dashboard.patient.messagesPage" />
    </div>
  );
}
