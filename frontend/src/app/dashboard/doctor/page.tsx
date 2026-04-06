'use client';

import { useAuth } from '@/context/AuthContext';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  appointments as appointmentsApi,
  doctors as doctorsApi,
  doctorStats as doctorStatsApi,
  DoctorAppointmentItem,
  DoctorScheduleEntry,
  DoctorStats,
} from '@/lib/api';
import DoctorDayCalendar from '@/components/booking/DoctorDayCalendar';
import AppointmentDetailModal from '@/components/booking/AppointmentDetailModal';

export default function DoctorDashboard() {
  const { user, loading } = useAuth();
  const t = useTranslations();
  const router = useRouter();

  const [stats, setStats] = useState<DoctorStats | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [appts, setAppts] = useState<DoctorAppointmentItem[]>([]);
  const [schedule, setSchedule] = useState<DoctorScheduleEntry | null>(null);
  const [apptLoading, setApptLoading] = useState(true);
  const [modalSid, setModalSid] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && user.user_type !== 'Doctor') router.push('/dashboard');
  }, [user, loading, router]);

  // Load stats
  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('access_token') || '';
      doctorStatsApi.get(token).then(setStats).catch(() => {});
    }
  }, [user]);

  // Load schedule for selected day
  useEffect(() => {
    if (user?.sid) {
      doctorsApi.schedule(user.sid).then((schedules) => {
        const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
        const pythonDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const todaySchedule = schedules.find((s) => s.day_of_week === pythonDay);
        setSchedule(todaySchedule || null);
      }).catch(() => setSchedule(null));
    }
  }, [user, selectedDate]);

  // Load appointments for selected date
  useEffect(() => {
    if (user) {
      setApptLoading(true);
      const token = localStorage.getItem('access_token') || '';
      appointmentsApi.doctorList(token, selectedDate)
        .then(setAppts)
        .catch(() => setAppts([]))
        .finally(() => setApptLoading(false));
    }
  }, [user, selectedDate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  const statCards = [
    { label: t('dashboard.doctor.appointmentsToday'), value: stats?.today_appointments ?? 0, color: 'bg-blue-100 text-blue-600', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { label: t('dashboard.doctor.upcoming'), value: stats?.pending_appointments ?? 0, color: 'bg-yellow-100 text-yellow-600', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: t('dashboard.doctor.completed'), value: stats?.completed_appointments ?? 0, color: 'bg-green-100 text-green-600', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: t('dashboard.doctor.totalAppointments'), value: stats?.total_appointments ?? 0, color: 'bg-indigo-100 text-indigo-600', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { label: t('dashboard.doctor.patients'), value: stats?.total_patients ?? 0, color: 'bg-teal-100 text-teal-600', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: t('dashboard.doctor.averageRating'), value: stats?.average_rating ? `${stats.average_rating.toFixed(1)}/5` : t('dashboard.doctor.noRating'), color: 'bg-purple-100 text-purple-600', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
    { label: t('dashboard.doctor.totalRevenue'), value: `$${stats?.total_revenue ?? 0}`, color: 'bg-emerald-100 text-emerald-600', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: t('dashboard.doctor.notifications'), value: stats?.unread_notifications ?? 0, color: 'bg-red-100 text-red-600', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">{t('dashboard.doctor.title')}</h2>

        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        {/* Date picker + Calendar */}
        <div className="mt-8">
          <div className="mb-4 flex items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-800">{t('dashboard.doctor.schedule')}</h3>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className="rounded-md bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200"
            >
              {t('booking.today')}
            </button>
          </div>

          {schedule ? (
            <DoctorDayCalendar
              date={selectedDate}
              appointments={appts}
              scheduleStart={schedule.start_time}
              scheduleEnd={schedule.end_time}
              breakStart={schedule.break_start}
              breakEnd={schedule.break_end}
              onAppointmentClick={setModalSid}
              loading={apptLoading}
            />
          ) : (
            <div className="rounded-lg bg-white p-8 shadow text-center">
              <p className="text-gray-500">{t('booking.noSchedule')}</p>
            </div>
          )}
        </div>

        {/* Appointment Detail Modal */}
        <AppointmentDetailModal
          isOpen={!!modalSid}
          onClose={() => setModalSid(null)}
          appointmentSid={modalSid}
        />
    </div>
  );
}
