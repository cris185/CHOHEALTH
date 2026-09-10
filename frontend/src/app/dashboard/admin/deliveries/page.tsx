'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { adminApi, AdminDelivery } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const STAGE_STYLE: Record<string, string> = {
  picked_up: 'bg-slate-100 text-slate-600 border-slate-200',
  on_the_way: 'bg-sky-50 text-sky-700 border-sky-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function AdminDeliveriesPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations('dashboard.admin.deliveriesPage');
  const tStage = useTranslations('dashboard.delivery.stage');
  const router = useRouter();

  const [deliveries, setDeliveries] = useState<AdminDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Superuser') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || user.user_type !== 'Superuser') return;
    const token = localStorage.getItem('access_token') || '';
    adminApi.deliveries(token)
      .then(setDeliveries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="section-title text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle', { count: deliveries.length })}</p>
      </div>

      <Card className="glass-panel">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-5">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
            </div>
          ) : deliveries.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colPatient')}</TableHead>
                  <TableHead>{t('colCourier')}</TableHead>
                  <TableHead>{t('colBranch')}</TableHead>
                  <TableHead>{t('colAddress')}</TableHead>
                  <TableHead>{t('colStage')}</TableHead>
                  <TableHead>{t('colCreated')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((d) => (
                  <TableRow key={d.sid}>
                    <TableCell
                      className="cursor-pointer font-medium hover:underline"
                      onClick={() => router.push(`/dashboard/admin/users/${d.patient_sid}`)}
                    >
                      {d.patient_name}
                    </TableCell>
                    <TableCell
                      className={d.courier_sid ? 'cursor-pointer text-muted-foreground hover:underline' : 'text-muted-foreground'}
                      onClick={() => d.courier_sid && router.push(`/dashboard/admin/users/${d.courier_sid}`)}
                    >
                      {d.courier_name || t('unassigned')}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{d.origin_branch || '—'}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground" title={d.address}>{d.address}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STAGE_STYLE[d.stage]}>{tStage(d.stage)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</TableCell>
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
