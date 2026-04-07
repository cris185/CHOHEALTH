'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { appointments as appointmentsApi, doctors as doctorsApi, DoctorAppointmentItem, DoctorScheduleEntry } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DoctorDayCalendar from '@/components/booking/DoctorDayCalendar';
import AppointmentDetailModal from '@/components/booking/AppointmentDetailModal';
import { CalendarDays } from 'lucide-react';

const statusVariant: Record<string, string> = {
  Pending: 'bg-blue-50 text-blue-700 border-blue-200',
  'Pending Payment': 'bg-amber-50 text-amber-700 border-amber-200',
  Confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Completed: 'bg-slate-100 text-slate-600 border-slate-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
  'No Show': 'bg-orange-50 text-orange-700 border-orange-200',
};

export default function DoctorAppointmentsPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [appts, setAppts] = useState<DoctorAppointmentItem[]>([]);
  const [schedule, setSchedule] = useState<DoctorScheduleEntry | null>(null);
  const [apptLoading, setApptLoading] = useState(true);
  const [modalSid, setModalSid] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Doctor') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <CalendarDays className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold tracking-tight">{t('dashboard.doctor.nav.appointments')}</h2>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-auto" />
        <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}>
          {t('booking.today')}
        </Button>
        <span className="text-sm text-muted-foreground">{appts.length} appointment(s)</span>
      </div>

      {/* Calendar view */}
      <Card className="mb-8">
        <CardContent className="p-6">
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
            <div className="py-12 text-center text-muted-foreground">{t('booking.noSchedule')}</div>
          )}
        </CardContent>
      </Card>

      {/* List view */}
      {!apptLoading && appts.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appts.map((a) => (
                  <TableRow key={a.sid} className="cursor-pointer" onClick={() => setModalSid(a.sid)}>
                    <TableCell className="font-medium">{a.date.split('T')[1]?.substring(0, 5) || ''}</TableCell>
                    <TableCell>{a.patient_name}</TableCell>
                    <TableCell>{a.service_name || '-'}</TableCell>
                    <TableCell>{a.mode}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusVariant[a.status] || ''}>{a.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AppointmentDetailModal isOpen={!!modalSid} onClose={() => setModalSid(null)} appointmentSid={modalSid} />
    </div>
  );
}
