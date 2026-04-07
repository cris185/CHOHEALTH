'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { appointments as appointmentsApi, AppointmentItem } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarDays } from 'lucide-react';

const statusVariant: Record<string, string> = {
  Pending: 'bg-blue-50 text-blue-700 border-blue-200',
  'Pending Payment': 'bg-amber-50 text-amber-700 border-amber-200',
  Confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Completed: 'bg-slate-100 text-slate-600 border-slate-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
  'No Show': 'bg-orange-50 text-orange-700 border-orange-200',
};

export default function PatientAppointmentsPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();
  const [appts, setAppts] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) {
      setLoading(true);
      const token = localStorage.getItem('access_token') || '';
      appointmentsApi.list(token).then(setAppts).catch(() => setAppts([])).finally(() => setLoading(false));
    }
  }, [user]);

  const filtered = filter === 'all' ? appts : appts.filter((a) => a.status === filter);

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <CalendarDays className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold tracking-tight">{t('dashboard.patient.appointments')}</h2>
      </div>

      <Tabs value={filter} onValueChange={setFilter} className="mb-6">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="Pending">Pending</TabsTrigger>
          <TabsTrigger value="Confirmed">Confirmed</TabsTrigger>
          <TabsTrigger value="Completed">Completed</TabsTrigger>
          <TabsTrigger value="Cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No appointments found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.sid}>
                    <TableCell className="font-medium">
                      {new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell>{a.doctor_name}</TableCell>
                    <TableCell>{a.service_name || '-'}</TableCell>
                    <TableCell>{a.mode}</TableCell>
                    <TableCell>{a.branch_name || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusVariant[a.status] || ''}>{a.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
