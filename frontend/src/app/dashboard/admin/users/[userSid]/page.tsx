'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTranslations } from 'next-intl';
import { adminApi, AdminUser, AdminDelivery } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const ROLE_STYLE: Record<string, string> = {
  Patient: 'bg-sky-50 text-sky-700 border-sky-200',
  Doctor: 'bg-violet-50 text-violet-700 border-violet-200',
  Delivery: 'bg-amber-50 text-amber-700 border-amber-200',
  Superuser: 'bg-slate-100 text-slate-700 border-slate-300',
};

const STAGE_STYLE: Record<string, string> = {
  picked_up: 'bg-slate-100 text-slate-600 border-slate-200',
  on_the_way: 'bg-sky-50 text-sky-700 border-sky-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function AdminUserDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations('dashboard.admin.userDetailPage');
  const tRoles = useTranslations('dashboard.admin.roles');
  const tStage = useTranslations('dashboard.delivery.stage');
  const tDuty = useTranslations('dashboard.delivery.dutyStatus');
  const router = useRouter();
  const params = useParams<{ userSid: string }>();

  const [detail, setDetail] = useState<{ user: AdminUser; deliveries: AdminDelivery[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Superuser') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || user.user_type !== 'Superuser') return;
    const token = localStorage.getItem('access_token') || '';
    adminApi.userDeliveries(params.userSid, token)
      .then(setDetail)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user, params.userSid]);

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/dashboard/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t('back')}
      </Link>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : error || !detail ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t('notFound')}</p>
      ) : (
        <>
          <Card className="glass-panel mb-6">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div>
                <h1 className="section-title text-2xl font-bold tracking-tight">{detail.user.full_name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{detail.user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={ROLE_STYLE[detail.user.user_type]}>
                  {tRoles(detail.user.user_type)}
                </Badge>
                {detail.user.phone && (
                  <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">{detail.user.phone}</Badge>
                )}
                {detail.user.on_duty_status && (
                  <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                    {tDuty(detail.user.on_duty_status)}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <h2 className="mb-3 text-sm font-semibold text-foreground">{t('deliveryHistory', { count: detail.deliveries.length })}</h2>
          <Card className="glass-panel">
            <CardContent className="p-0">
              {detail.deliveries.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">{t('noDeliveries')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('colOrder')}</TableHead>
                      <TableHead>{t('colCounterpart')}</TableHead>
                      <TableHead>{t('colAddress')}</TableHead>
                      <TableHead>{t('colStage')}</TableHead>
                      <TableHead>{t('colCreated')}</TableHead>
                      <TableHead>{t('colDelivered')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.deliveries.map((d) => (
                      <TableRow key={d.sid}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{d.order_sid.slice(0, 8)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {detail.user.user_type === 'Delivery' ? d.patient_name : (d.courier_name || t('unassigned'))}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground" title={d.address}>{d.address}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STAGE_STYLE[d.stage]}>{tStage(d.stage)}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {d.delivered_at ? new Date(d.delivered_at).toLocaleDateString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
