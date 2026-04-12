'use client';

import { useAuth } from '@/context/AuthContext';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  appointments as appointmentsApi,
  doctors as doctorsApi,
  doctorStats as doctorStatsApi,
  DoctorAppointmentItem,
  DoctorScheduleEntry,
  DoctorStats,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import DoctorDayCalendar from '@/components/booking/DoctorDayCalendar';
import AppointmentDetailModal from '@/components/booking/AppointmentDetailModal';
import { CalendarDays, Clock, CheckCircle, Archive, Users, Star, DollarSign, Bell, Activity, Stethoscope } from 'lucide-react';
import Link from 'next/link';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const statusVariant: Record<string, string> = {
  Pending: 'bg-blue-50 text-blue-700 border-blue-200',
  Confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Completed: 'bg-slate-100 text-slate-600 border-slate-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
};

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
    if (loading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Doctor') { router.replace('/dashboard'); return; }
  }, [user, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('access_token') || '';
      doctorStatsApi.get(token).then(setStats).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (user?.sid) {
      doctorsApi.schedule(user.sid).then((schedules) => {
        const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
        const pythonDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        setSchedule(schedules.find((s) => s.day_of_week === pythonDay) || null);
      }).catch(() => setSchedule(null));
    }
  }, [user, selectedDate]);

  useEffect(() => {
    if (user) {
      setApptLoading(true);
      const token = localStorage.getItem('access_token') || '';
      appointmentsApi.doctorList(token, selectedDate).then(setAppts).catch(() => setAppts([])).finally(() => setApptLoading(false));
    }
  }, [user, selectedDate]);

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-5 w-40 mb-8" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const gradientCards = [
    { label: t('dashboard.doctor.appointmentsToday'), value: stats?.today_appointments ?? 0, icon: CalendarDays, gradient: 'from-blue-500 to-indigo-600', desc: 'Scheduled for today' },
    { label: t('dashboard.doctor.totalRevenue'), value: `$${stats?.total_revenue ?? 0}`, icon: DollarSign, gradient: 'from-emerald-500 to-teal-600', desc: 'Total earnings' },
    { label: t('dashboard.doctor.patients'), value: stats?.total_patients ?? 0, icon: Users, gradient: 'from-violet-500 to-purple-600', desc: 'Unique patients' },
  ];

  const whiteCards = [
    { label: t('dashboard.doctor.upcoming'), value: stats?.pending_appointments ?? 0, icon: Clock, color: 'text-amber-600 bg-amber-50' },
    { label: t('dashboard.doctor.completed'), value: stats?.completed_appointments ?? 0, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
    { label: t('dashboard.doctor.totalAppointments'), value: stats?.total_appointments ?? 0, icon: Archive, color: 'text-indigo-600 bg-indigo-50' },
    { label: t('dashboard.doctor.averageRating'), value: stats?.average_rating ? `${stats.average_rating.toFixed(1)}/5` : t('dashboard.doctor.noRating'), icon: Star, color: 'text-purple-600 bg-purple-50' },
    { label: t('dashboard.doctor.notifications'), value: stats?.unread_notifications ?? 0, icon: Bell, color: 'text-rose-600 bg-rose-50' },
  ];

  const todayAppts = appts.filter((a) => ['Pending', 'Confirmed'].includes(a.status));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Stethoscope className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('dashboard.doctor.title')}</h2>
            <p className="text-sm text-muted-foreground">Welcome back, <span className="font-medium text-foreground">Dr. {user.username}</span></p>
          </div>
        </div>
      </motion.div>

      {/* Gradient stat cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-3 mb-4">
        {gradientCards.map((card) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.label} variants={item}>
              <Card className={`bg-gradient-to-br ${card.gradient} border-0 text-white overflow-hidden relative group hover:shadow-lg transition-shadow duration-300`}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-8 -translate-x-8" />
                <CardContent className="p-6 relative">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white/80">{card.label}</p>
                      <p className="text-4xl font-bold mt-2 tracking-tight">{card.value}</p>
                      <p className="text-xs text-white/60 mt-1">{card.desc}</p>
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 group-hover:bg-white/20 transition-colors">
                      <Icon className="h-7 w-7 text-white/80" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* White stat cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
        {whiteCards.map((card) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.label} variants={item}>
              <Card className="hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.color} transition-transform`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">{card.label}</p>
                      <p className="text-lg font-bold tracking-tight">{card.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Two column: Schedule + Today's Appointments */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Schedule Calendar */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  {t('dashboard.doctor.schedule')}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-auto h-8 text-xs" />
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}>
                    {t('booking.today')}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
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
                <div className="py-16 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-muted-foreground">{t('booking.noSchedule')}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Contact admin to set up your schedule</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Today's Appointments List */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Today&apos;s Queue</CardTitle>
                <Badge variant="secondary">{todayAppts.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {todayAppts.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-muted-foreground">No appointments today</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Enjoy your day off!</p>
                </div>
              ) : (
                <div className="divide-y">
                  {todayAppts.map((appt) => {
                    const time = appt.date.split('T')[1]?.substring(0, 5) || '';
                    return (
                      <div key={appt.sid} className="flex items-center justify-between px-6 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setModalSid(appt.sid)}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{appt.patient_name}</p>
                          <p className="text-xs text-muted-foreground">{time} &middot; {appt.service_name}</p>
                        </div>
                        <Badge variant="outline" className={`shrink-0 ${statusVariant[appt.status] || ''}`}>{appt.status}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="border-t p-3">
                <Link href="/dashboard/doctor/appointments" className="text-xs text-primary hover:underline block text-center">View all appointments</Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <AppointmentDetailModal
        isOpen={!!modalSid}
        onClose={() => setModalSid(null)}
        appointmentSid={modalSid}
        onAppointmentChanged={() => {
          const token = localStorage.getItem('access_token') || '';
          appointmentsApi.doctorList(token, selectedDate).then(setAppts).catch(() => {});
        }}
      />
    </div>
  );
}
