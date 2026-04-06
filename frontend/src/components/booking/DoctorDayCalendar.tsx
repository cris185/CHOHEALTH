'use client';

import { useTranslations } from 'next-intl';
import type { DoctorAppointmentItem } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

interface DoctorDayCalendarProps {
  date: string;
  appointments: DoctorAppointmentItem[];
  scheduleStart: string;
  scheduleEnd: string;
  breakStart: string | null;
  breakEnd: string | null;
  onAppointmentClick: (sid: string) => void;
  loading?: boolean;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export default function DoctorDayCalendar({
  date, appointments, scheduleStart, scheduleEnd, breakStart, breakEnd, onAppointmentClick, loading,
}: DoctorDayCalendarProps) {
  const t = useTranslations();

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const startMin = timeToMinutes(scheduleStart);
  const endMin = timeToMinutes(scheduleEnd);
  const totalMin = endMin - startMin;

  // Generate hour labels
  const hours: string[] = [];
  for (let m = startMin; m < endMin; m += 60) {
    const h = Math.floor(m / 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    hours.push(`${h12}:00 ${ampm}`);
  }

  // Break range
  const breakStartMin = breakStart ? timeToMinutes(breakStart) : null;
  const breakEndMin = breakEnd ? timeToMinutes(breakEnd) : null;

  // Map appointments to positions
  const apptPositions = appointments.map((appt) => {
    const apptTime = appt.date.split('T')[1]?.substring(0, 5) || '00:00';
    const apptStartMin = timeToMinutes(apptTime);
    const apptEndMin = apptStartMin + appt.service_duration;
    return { ...appt, apptStartMin, apptEndMin, apptTime };
  });

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-center text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">{formattedDate}</h3>
      <p className="mb-4 text-sm text-gray-500">
        {scheduleStart} - {scheduleEnd} &middot; {appointments.length} appointment(s)
      </p>

      <div className="relative" style={{ minHeight: `${(totalMin / 60) * 80}px` }}>
        {/* Hour grid lines */}
        {hours.map((label, i) => {
          const topPx = (i * 60 / totalMin) * 100;
          return (
            <div key={label} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: `${topPx}%` }}>
              <span className="absolute -top-3 left-0 text-xs text-gray-400 bg-white pr-2">{label}</span>
            </div>
          );
        })}

        {/* Break block */}
        {breakStartMin !== null && breakEndMin !== null && (
          <div
            className="absolute left-16 right-0 bg-yellow-50 border border-yellow-200 rounded flex items-center justify-center"
            style={{
              top: `${((breakStartMin - startMin) / totalMin) * 100}%`,
              height: `${((breakEndMin - breakStartMin) / totalMin) * 100}%`,
            }}
          >
            <span className="text-xs font-medium text-yellow-600">{t('booking.break')}</span>
          </div>
        )}

        {/* Appointment blocks */}
        {apptPositions.map((appt) => {
          const topPercent = ((appt.apptStartMin - startMin) / totalMin) * 100;
          const heightPercent = ((appt.apptEndMin - appt.apptStartMin) / totalMin) * 100;

          const statusColors: Record<string, string> = {
            Pending: 'bg-blue-50 border-blue-300 text-blue-700',
            Confirmed: 'bg-green-50 border-green-300 text-green-700',
            Completed: 'bg-gray-50 border-gray-300 text-gray-500',
            Cancelled: 'bg-red-50 border-red-300 text-red-400',
            'No Show': 'bg-orange-50 border-orange-300 text-orange-500',
          };

          const colorClass = statusColors[appt.status] || 'bg-blue-50 border-blue-300 text-blue-700';
          const patientImage = appt.patient_image
            ? appt.patient_image.startsWith('http') ? appt.patient_image : `${API_BASE}${appt.patient_image}`
            : null;

          return (
            <div
              key={appt.sid}
              className={`absolute left-16 right-0 rounded border p-2 cursor-pointer hover:shadow-md transition ${colorClass}`}
              style={{
                top: `${topPercent}%`,
                height: `${heightPercent}%`,
                minHeight: '40px',
              }}
              onClick={() => onAppointmentClick(appt.sid)}
            >
              <div className="flex items-center gap-2">
                {patientImage ? (
                  <img src={patientImage} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200">
                    <svg className="h-3 w-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{appt.patient_name}</p>
                  <p className="truncate text-[10px]">{appt.apptTime} &middot; {appt.service_name} &middot; {appt.service_duration}min</p>
                </div>
                <span className="text-[10px] font-medium">{appt.status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}