'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  appointments as appointmentsApi,
  doctors as doctorsApi,
  DoctorAppointmentItem,
  DoctorScheduleEntry,
} from '@/lib/api';
import DoctorDayCalendar from '@/components/booking/DoctorDayCalendar';
import AppointmentDetailModal from '@/components/booking/AppointmentDetailModal';

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
    if (!authLoading && !user) router.push('/login');
    if (!authLoading && user && user.user_type !== 'Doctor') router.push('/dashboard');
  }, [user, authLoading, router]);

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

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h2 className="mb-6 text-2xl font-bold text-gray-900">{t('dashboard.doctor.nav.appointments')}</h2>

      <div className="mb-4 flex items-center gap-4">
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
        <span className="text-sm text-gray-500">
          {appts.length} appointment(s)
        </span>
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

      {/* Appointment list below calendar */}
      {!apptLoading && appts.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-4 text-lg font-semibold text-gray-800">Appointment List</h3>
          <div className="overflow-hidden rounded-lg bg-white shadow">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Time</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Patient</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Service</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Mode</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {appts.map((a) => {
                  const time = a.date.split('T')[1]?.substring(0, 5) || '';
                  const statusColors: Record<string, string> = {
                    Pending: 'bg-blue-100 text-blue-700',
                    Confirmed: 'bg-green-100 text-green-700',
                    Completed: 'bg-gray-100 text-gray-600',
                    Cancelled: 'bg-red-100 text-red-700',
                    'No Show': 'bg-orange-100 text-orange-700',
                  };
                  return (
                    <tr key={a.sid} className="hover:bg-gray-50 cursor-pointer" onClick={() => setModalSid(a.sid)}>
                      <td className="px-4 py-3 font-medium text-gray-900">{time}</td>
                      <td className="px-4 py-3 text-gray-900">{a.patient_name}</td>
                      <td className="px-4 py-3 text-gray-600">{a.service_name || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{a.mode}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[a.status] || ''}`}>
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AppointmentDetailModal
        isOpen={!!modalSid}
        onClose={() => setModalSid(null)}
        appointmentSid={modalSid}
      />
    </div>
  );
}
