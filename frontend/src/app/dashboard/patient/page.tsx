'use client';

import { useAuth } from '@/context/AuthContext';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { patientStats as patientStatsApi, PatientStats, appointments as appointmentsApi, AppointmentItem } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import ServiceList from '@/components/ServiceList';
import { CalendarDays, Clock, CheckCircle, FileText, FlaskConical, Bell, Activity, CalendarCheck } from 'lucide-react';
import Link from 'next/link';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const statusVariant: Record<string, string> = {
  Pending: 'bg-blue-50 text-blue-700 border-blue-200',
  'Pending Payment': 'bg-amber-50 text-amber-700 border-amber-200',
  Confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Completed: 'bg-slate-100 text-slate-600 border-slate-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
};

export default function PatientDashboard() {
  const { user, loading } = useAuth();
  const t = useTranslations();
  const router = useRouter();
  const [stats, setStats] = useState<PatientStats | null>(null);
  const [recentAppts, setRecentAppts] = useState<AppointmentItem[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('access_token') || '';
      patientStatsApi.get(token).then(setStats).catch(() => {});
      appointmentsApi.list(token).then((data) => setRecentAppts(data.slice(0, 5))).catch(() => {});
    }
  }, [user]);

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-5 w-40 mb-8" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const gradientCards = [
    { label: t('dashboard.patient.upcoming'), value: stats?.upcoming_appointments ?? 0, icon: Clock, gradient: 'from-blue-500 to-indigo-600', desc: 'Scheduled appointments' },
    { label: t('dashboard.patient.completed'), value: stats?.completed_appointments ?? 0, icon: CheckCircle, gradient: 'from-emerald-500 to-teal-600', desc: 'Completed visits' },
  ];

  const whiteCards = [
    { label: t('dashboard.patient.totalAppointments'), value: stats?.total_appointments ?? 0, icon: CalendarDays, color: 'text-indigo-600 bg-indigo-50', trend: '+12%' },
    { label: t('dashboard.patient.medicalHistory'), value: stats?.total_medical_records ?? 0, icon: FileText, color: 'text-purple-600 bg-purple-50' },
    { label: t('dashboard.patient.labs'), value: stats?.total_lab_results ?? 0, icon: FlaskConical, color: 'text-teal-600 bg-teal-50' },
    { label: 'Notifications', value: stats?.unread_notifications ?? 0, icon: Bell, color: 'text-rose-600 bg-rose-50' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('dashboard.patient.title')}</h2>
            <p className="text-sm text-muted-foreground">Welcome back, <span className="font-medium text-foreground">{user.username}</span></p>
          </div>
        </div>
      </motion.div>

      {/* Gradient stat cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 mb-4">
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
      <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {whiteCards.map((card) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.label} variants={item}>
              <Card className="hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.color} transition-transform group-hover:scale-110`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground truncate">{card.label}</p>
                      <p className="text-xl font-bold tracking-tight">{card.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Two column layout: Recent Activity + Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        {/* Recent Appointments */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-primary" />
                  Recent Appointments
                </CardTitle>
                <Link href="/dashboard/patient/appointments" className="text-xs text-primary hover:underline">View all</Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recentAppts.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-muted-foreground">No appointments yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Browse services to book your first appointment</p>
                </div>
              ) : (
                <div className="divide-y">
                  {recentAppts.map((appt) => (
                    <div key={appt.sid} className="flex items-center justify-between px-6 py-3.5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <CalendarDays className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{appt.doctor_name}</p>
                          <p className="text-xs text-muted-foreground">{appt.service_name} &middot; {new Date(appt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`shrink-0 ${statusVariant[appt.status] || ''}`}>{appt.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Actions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { href: '/dashboard/patient/services', label: 'Book Appointment', icon: CalendarDays, color: 'bg-blue-50 text-blue-600' },
                { href: '/dashboard/patient/appointments', label: 'My Appointments', icon: Clock, color: 'bg-emerald-50 text-emerald-600' },
                { href: '/dashboard/patient/notifications', label: 'Notifications', icon: Bell, color: 'bg-rose-50 text-rose-600' },
                { href: '/dashboard/patient/profile', label: 'Edit Profile', icon: FileText, color: 'bg-purple-50 text-purple-600' },
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.href} href={action.href}>
                    <div className="flex items-center gap-3 rounded-xl p-3 hover:bg-muted/50 transition-colors cursor-pointer group">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${action.color} group-hover:scale-105 transition-transform`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium">{action.label}</span>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Services */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t('services.title')}</h3>
          <Link href="/dashboard/patient/services" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        <ServiceList showBookButton={false} clickable={true} />
      </motion.div>
    </div>
  );
}
