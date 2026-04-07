'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { patientPayments, PatientPaymentItem, PatientPaymentStats } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, TrendingUp, Clock } from 'lucide-react';

const statusVariant: Record<string, string> = {
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Failed: 'bg-red-50 text-red-700 border-red-200',
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
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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
      patientPayments.list(token, page).then((data) => { setPayments(data.results); setTotalCount(data.count); }).catch(() => {}).finally(() => setLoading(false));
    }
  }, [user, page]);

  const totalPages = Math.ceil(totalCount / 20);
  if (authLoading || !user) return null;

  const summaryCards = [
    { label: 'Total Paid', value: `$${stats?.total_paid ?? 0}`, icon: DollarSign, gradient: 'from-emerald-500 to-emerald-600' },
    { label: 'This Month', value: `$${stats?.this_month_paid ?? 0}`, icon: TrendingUp, gradient: 'from-blue-500 to-blue-600' },
    { label: 'Pending', value: `$${stats?.pending_amount ?? 0}`, icon: Clock, gradient: 'from-amber-500 to-amber-600' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <DollarSign className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold tracking-tight">Payments</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className={`bg-gradient-to-br ${card.gradient} border-0 text-white`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white/80">{card.label}</p>
                    <p className="text-3xl font-bold mt-1">{card.value}</p>
                  </div>
                  <Icon className="h-10 w-10 text-white/30" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : payments.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No payments found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.sid}>
                    <TableCell className="font-medium">{p.doctor_name || '-'}</TableCell>
                    <TableCell>{p.service_name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{p.invoice_number}</TableCell>
                    <TableCell className="font-semibold">${p.amount}</TableCell>
                    <TableCell className="capitalize">{p.payment_method}</TableCell>
                    <TableCell>{p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</TableCell>
                    <TableCell><Badge variant="outline" className={statusVariant[p.status] || ''}>{p.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
        </div>
      )}
    </div>
  );
}
