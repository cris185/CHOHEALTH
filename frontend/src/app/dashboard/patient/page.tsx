'use client';

import { useAuth } from '@/context/AuthContext';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { patientStats as patientStatsApi, PatientStats } from '@/lib/api';
import ServiceList from '@/components/ServiceList';

export default function PatientDashboard() {
  const { user, loading } = useAuth();
  const t = useTranslations();
  const router = useRouter();
  const [stats, setStats] = useState<PatientStats | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && user.user_type !== 'Patient') router.push('/dashboard');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('access_token') || '';
      patientStatsApi.get(token).then(setStats).catch(() => {});
    }
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  const statCards = [
    { label: t('dashboard.patient.upcoming'), value: stats?.upcoming_appointments ?? 0, color: 'bg-blue-100 text-blue-600', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: t('dashboard.patient.completed'), value: stats?.completed_appointments ?? 0, color: 'bg-green-100 text-green-600', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: t('dashboard.patient.totalAppointments'), value: stats?.total_appointments ?? 0, color: 'bg-indigo-100 text-indigo-600', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { label: t('dashboard.patient.medicalHistory'), value: stats?.total_medical_records ?? 0, color: 'bg-purple-100 text-purple-600', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { label: t('dashboard.patient.labs'), value: stats?.total_lab_results ?? 0, color: 'bg-teal-100 text-teal-600', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
    { label: 'Notifications', value: stats?.unread_notifications ?? 0, color: 'bg-red-100 text-red-600', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h2 className="mb-6 text-2xl font-bold text-gray-900">{t('dashboard.patient.title')}</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-lg bg-white p-5 shadow">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${card.color.split(' ')[0]}`}>
                <svg className={`h-5 w-5 ${card.color.split(' ')[1]}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.icon} />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className="text-xl font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h3 className="mb-4 text-lg font-semibold text-gray-800">{t('services.title')}</h3>
        <ServiceList showBookButton={false} clickable={true} />
      </div>
    </div>
  );
}
