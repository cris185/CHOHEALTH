'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { appointments as appointmentsApi, AppointmentItem } from '@/lib/api';

const statusColors: Record<string, string> = {
  Pending: 'bg-blue-100 text-blue-700',
  Confirmed: 'bg-green-100 text-green-700',
  Completed: 'bg-gray-100 text-gray-600',
  Cancelled: 'bg-red-100 text-red-700',
  'No Show': 'bg-orange-100 text-orange-700',
};

export default function PatientAppointmentsPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();
  const [appts, setAppts] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    if (!authLoading && user && user.user_type !== 'Patient') router.push('/dashboard');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      const token = localStorage.getItem('access_token') || '';
      appointmentsApi.list(token)
        .then(setAppts)
        .catch(() => setAppts([]))
        .finally(() => setLoading(false));
    }
  }, [user]);

  const filtered = filter === 'all' ? appts : appts.filter((a) => a.status === filter);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h2 className="mb-6 text-2xl font-bold text-gray-900">{t('dashboard.patient.appointments')}</h2>

      {/* Filter */}
      <div className="mb-4 flex gap-2 flex-wrap">
        {['all', 'Pending', 'Confirmed', 'Completed', 'Cancelled'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        {loading ? (
          <div className="p-8 text-center text-gray-400">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No appointments found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Date & Time</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Doctor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Service</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Mode</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Branch</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((a) => (
                <tr key={a.sid} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{a.doctor_name}</td>
                  <td className="px-4 py-3 text-gray-600">{a.service_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{a.mode}</td>
                  <td className="px-4 py-3 text-gray-600">{a.branch_name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[a.status] || ''}`}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
