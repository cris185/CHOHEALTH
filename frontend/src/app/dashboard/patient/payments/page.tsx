'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { patientPayments, PatientPaymentItem, PatientPaymentStats } from '@/lib/api';

const statusColors: Record<string, string> = {
  Completed: 'bg-green-100 text-green-700',
  Pending: 'bg-yellow-100 text-yellow-700',
  Failed: 'bg-red-100 text-red-700',
};

export default function PatientPaymentsPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();

  const [payments, setPayments] = useState<PatientPaymentItem[]>([]);
  const [stats, setStats] = useState<PatientPaymentStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    if (!authLoading && user && user.user_type !== 'Patient') router.push('/dashboard');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('access_token') || '';
      patientPayments.stats(token).then(setStats).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      const token = localStorage.getItem('access_token') || '';
      patientPayments.list(token, page)
        .then((data) => { setPayments(data.results); setTotalCount(data.count); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [user, page]);

  const totalPages = Math.ceil(totalCount / 20);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h2 className="mb-6 text-2xl font-bold text-gray-900">Payments</h2>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-5 shadow">
          <p className="text-sm text-gray-500">Total Paid</p>
          <p className="text-2xl font-bold text-gray-900">${stats?.total_paid ?? 0}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow">
          <p className="text-sm text-gray-500">This Month</p>
          <p className="text-2xl font-bold text-gray-900">${stats?.this_month_paid ?? 0}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">${stats?.pending_amount ?? 0}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        {loading ? (
          <div className="p-8 text-center text-gray-400">{t('common.loading')}</div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No payments found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Doctor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Service</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Invoice</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Method</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.map((p) => (
                <tr key={p.sid} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.doctor_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.service_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.invoice_number}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">${p.amount}</td>
                  <td className="px-4 py-3 text-gray-600">{p.payment_method}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[p.status] || ''}`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">Previous</button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
