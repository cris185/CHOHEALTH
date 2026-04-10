'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { appointments as appointmentsApi, doctors as doctorsApi, DoctorAppointmentItem, DoctorScheduleEntry } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import DoctorDayCalendar from '@/components/booking/DoctorDayCalendar';
import AppointmentDetailModal from '@/components/booking/AppointmentDetailModal';
import { CalendarDays } from 'lucide-react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function DoctorAppointmentsPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(now.toISOString().split('T')[0]);

  const [monthAppts, setMonthAppts] = useState<DoctorAppointmentItem[]>([]);
  const [monthLoading, setMonthLoading] = useState(true);

  const [dayAppts, setDayAppts] = useState<DoctorAppointmentItem[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  const [allSchedules, setAllSchedules] = useState<DoctorScheduleEntry[]>([]);
  const [schedule, setSchedule] = useState<DoctorScheduleEntry | null>(null);
  const [modalSid, setModalSid] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Doctor') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load all schedule entries once
  useEffect(() => {
    if (user?.sid) {
      doctorsApi.schedule(user.sid).then(setAllSchedules).catch(() => setAllSchedules([]));
    }
  }, [user]);

  // Load appointments for the visible month
  useEffect(() => {
    if (user) {
      setMonthLoading(true);
      const token = localStorage.getItem('access_token') || '';
      const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
      appointmentsApi.doctorListByMonth(token, monthStr)
        .then(setMonthAppts)
        .catch(() => setMonthAppts([]))
        .finally(() => setMonthLoading(false));
    }
  }, [user, calYear, calMonth]);

  // Load appointments for selected day
  useEffect(() => {
    if (user && selectedDate) {
      setDayLoading(true);
      const token = localStorage.getItem('access_token') || '';
      appointmentsApi.doctorList(token, selectedDate)
        .then(setDayAppts)
        .catch(() => setDayAppts([]))
        .finally(() => setDayLoading(false));

      // Find matching schedule for the selected day
      const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
      const pythonDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      setSchedule(allSchedules.find((s) => s.day_of_week === pythonDay) || null);
    }
  }, [user, selectedDate, allSchedules]);

  // Build a map of dates that have appointments
  const appointmentDatesMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const appt of monthAppts) {
      const dateStr = appt.date.split('T')[0];
      map.set(dateStr, (map.get(dateStr) || 0) + 1);
    }
    return map;
  }, [monthAppts]);

  const handleMonthChange = (year: number, month: number) => {
    setCalYear(year);
    setCalMonth(month);
  };

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
  };

  if (authLoading || !user) return null;

  // Calendar rendering
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} className="h-20" />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const apptCount = appointmentDatesMap.get(dateStr) || 0;
    const isSelected = selectedDate === dateStr;
    const isToday = dateStr === today;

    let cellClass = 'h-20 flex flex-col items-center justify-center rounded-xl text-sm font-medium transition cursor-pointer relative ';

    if (isSelected) {
      cellClass += 'bg-blue-600 text-white ring-2 ring-blue-600 ring-offset-2';
    } else if (apptCount > 0) {
      cellClass += 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100';
    } else {
      cellClass += 'text-gray-500 hover:bg-gray-50';
    }

    cells.push(
      <div
        key={dateStr}
        className={cellClass}
        onClick={() => handleSelectDate(dateStr)}
      >
        <span className={isToday && !isSelected ? 'bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 text-xs font-bold' : ''}>
          {day}
        </span>
        {apptCount > 0 && !isSelected && (
          <div className="flex items-center gap-1 mt-1">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-[10px] font-medium text-blue-600">
              {t('dashboard.doctor.appointmentsPage.hasAppointments', { count: apptCount })}
            </span>
          </div>
        )}
        {isSelected && apptCount > 0 && (
          <span className="text-[10px] mt-1 text-blue-100">
            {t('dashboard.doctor.appointmentsPage.hasAppointments', { count: apptCount })}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">{t('dashboard.doctor.nav.appointments')}</h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          const todayDate = new Date();
          setCalYear(todayDate.getFullYear());
          setCalMonth(todayDate.getMonth());
          setSelectedDate(todayDate.toISOString().split('T')[0]);
        }}>
          {t('booking.today')}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        {/* Left: Calendar */}
        <div>
          <Card>
            <CardContent className="p-5">
              {/* Month navigation */}
              <div className="mb-4 flex items-center justify-between">
                <button
                  onClick={() => handleMonthChange(calMonth === 0 ? calYear - 1 : calYear, calMonth === 0 ? 11 : calMonth - 1)}
                  className="rounded-lg p-2 hover:bg-gray-100 transition"
                >
                  <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h3 className="text-lg font-bold text-gray-900">
                  {MONTH_NAMES[calMonth]} {calYear}
                </h3>
                <button
                  onClick={() => handleMonthChange(calMonth === 11 ? calYear + 1 : calYear, calMonth === 11 ? 0 : calMonth + 1)}
                  className="rounded-lg p-2 hover:bg-gray-100 transition"
                >
                  <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Legend */}
              <div className="mb-3 flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" /> Has appointments
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-200" /> No appointments
                </span>
              </div>

              {/* Weekdays + grid */}
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2">{d}</div>
                ))}
                {monthLoading ? (
                  <div className="col-span-7 py-12 text-center text-gray-400">{t('common.loading')}</div>
                ) : (
                  cells
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Day timeline */}
        <div>
          {selectedDate ? (
            <Card>
              <CardContent className="p-5">
                {/* Day header with count */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                      })}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t('dashboard.doctor.appointmentsPage.appointmentCount', { count: dayAppts.length })}
                    </p>
                  </div>
                </div>

                {/* Timeline */}
                {schedule ? (
                  <DoctorDayCalendar
                    date={selectedDate}
                    appointments={dayAppts}
                    scheduleStart={schedule.start_time}
                    scheduleEnd={schedule.end_time}
                    breakStart={schedule.break_start}
                    breakEnd={schedule.break_end}
                    onAppointmentClick={setModalSid}
                    loading={dayLoading}
                  />
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    {t('booking.noSchedule')}
                  </div>
                )}

                {/* Appointments list below the timeline */}
                {!dayLoading && dayAppts.length > 0 && (
                  <div className="mt-6 border-t pt-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Appointment Details</h4>
                    <div className="space-y-2">
                      {dayAppts.map((a) => {
                        const time = a.date.split('T')[1]?.substring(0, 5) || '';
                        const statusColors: Record<string, string> = {
                          Pending: 'bg-blue-50 text-blue-700 border-blue-200',
                          'Pending Payment': 'bg-amber-50 text-amber-700 border-amber-200',
                          Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
                          Confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          'In Progress': 'bg-indigo-50 text-indigo-700 border-indigo-200',
                          Completed: 'bg-slate-100 text-slate-600 border-slate-200',
                          Cancelled: 'bg-red-50 text-red-700 border-red-200',
                          'No Show': 'bg-orange-50 text-orange-700 border-orange-200',
                        };
                        return (
                          <div
                            key={a.sid}
                            className="flex items-center gap-4 rounded-lg border p-3 cursor-pointer hover:shadow-sm transition"
                            onClick={() => setModalSid(a.sid)}
                          >
                            <div className="text-sm font-mono font-medium text-gray-600 w-14 shrink-0">{time}</div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-900 truncate">{a.patient_name}</p>
                              <p className="text-xs text-gray-500 truncate">{a.service_name || '-'} &middot; {a.service_duration} min &middot; {a.mode}</p>
                            </div>
                            <span className={`text-xs font-medium rounded-full px-2.5 py-1 border ${statusColors[a.status] || ''}`}>
                              {a.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!dayLoading && dayAppts.length === 0 && (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    {t('dashboard.doctor.appointmentsPage.noAppointments')}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-20">
                <p className="text-muted-foreground">{t('dashboard.doctor.appointmentsPage.selectDayPrompt')}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AppointmentDetailModal isOpen={!!modalSid} onClose={() => setModalSid(null)} appointmentSid={modalSid} />
    </div>
  );
}
