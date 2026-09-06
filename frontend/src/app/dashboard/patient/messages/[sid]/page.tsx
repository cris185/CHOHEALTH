'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import ThreadView from '@/components/messaging/ThreadView';

export default function PatientThreadPage() {
  const { sid } = useParams<{ sid: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, authLoading, router]);

  if (authLoading || !user || !sid) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <ThreadView threadSid={sid} basePath="/dashboard/patient/messages" i18nNamespace="dashboard.patient.messagesPage" />
    </div>
  );
}
