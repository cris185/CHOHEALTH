'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { adminApi, AdminDelivery, AdminUser } from '@/lib/api';
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
  const [couriers, setCouriers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [pickedCourier, setPickedCourier] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Superuser') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = () => {
    const token = localStorage.getItem('access_token') || '';
    return Promise.all([adminApi.deliveries(token), adminApi.users(token)])
      .then(([d, u]) => {
        setDeliveries(d);
        setCouriers(u.filter((row) => row.user_type === 'Delivery'));
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!user || user.user_type !== 'Superuser') return;
    load().finally(() => setLoading(false));
  }, [user]);

  const handleAssign = async (deliverySid: string) => {
    const courierSid = pickedCourier[deliverySid];
    if (!courierSid) return;
    setError('');
    setAssigning(deliverySid);
    try {
      const token = localStorage.getItem('access_token') || '';
      await adminApi.assignCourier(deliverySid, courierSid, token);
      await load();
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string } };
      setError(apiError?.data?.detail || t('assignError'));
    } finally {
      setAssigning(null);
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="section-title text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle', { count: deliveries.length })}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

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
                  <TableHead>{t('colAction')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((d) => {
                  const canAssign = !d.courier_sid && d.stage !== 'delivered';
                  return (
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
                      <TableCell>
                        {canAssign ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={pickedCourier[d.sid] || ''}
                              onChange={(e) => setPickedCourier((prev) => ({ ...prev, [d.sid]: e.target.value }))}
                              disabled={assigning === d.sid}
                              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                            >
                              <option value="">{t('pickCourier')}</option>
                              {couriers.map((c) => (
                                <option key={c.sid} value={c.sid}>
                                  {c.full_name} {c.on_duty_status === 'on_duty' ? `· ${t('onDuty')}` : c.on_duty_status === 'on_break' ? `· ${t('onBreak')}` : `· ${t('offDuty')}`}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleAssign(d.sid)}
                              disabled={!pickedCourier[d.sid] || assigning === d.sid}
                              className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {assigning === d.sid ? t('assigning') : t('assign')}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
