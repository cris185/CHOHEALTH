'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { deliveryPerson as deliveryPersonApi, DeliveryPersonProfile, DeliveryHistoryItem } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, CheckCircle2, Clock, Truck } from 'lucide-react';
import { getTodayInNY, APP_TZ } from '@/lib/tz';

const STATUS_STYLE: Record<string, string> = {
  off_duty: 'bg-slate-100 text-slate-600 border-slate-200',
  on_duty: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  on_break: 'bg-amber-50 text-amber-700 border-amber-200',
};

function toNYDateString(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(new Date(iso));
}

export default function DeliveryDashboard() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations('dashboard.delivery.dashboardPage');
  const tNav = useTranslations();
  const router = useRouter();

  const [profile, setProfile] = useState<DeliveryPersonProfile | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Delivery') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('access_token') || '';
    Promise.all([
      deliveryPersonApi.profile(token),
      deliveryPersonApi.deliveries(token),
    ])
      .then(([p, d]) => { setProfile(p); setDeliveries(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || !user) return null;

  const today = getTodayInNY();
  const todayCount = deliveries.filter((d) => toNYDateString(d.created_at) === today).length;
  const completed = deliveries.filter((d) => d.stage === 'delivered');
  const avgMinutes = (() => {
    const durations = completed
      .filter((d) => d.delivered_at)
      .map((d) => (new Date(d.delivered_at as string).getTime() - new Date(d.created_at).getTime()) / 60000);
    if (!durations.length) return null;
    return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  })();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="section-title text-2xl font-bold tracking-tight">{t('title')}</h1>
        {profile && (
          <Badge variant="outline" className={STATUS_STYLE[profile.on_duty_status]}>
            {tNav(`dashboard.delivery.dutyStatus.${profile.on_duty_status}`)}
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="glass-panel">
              <CardContent className="flex items-center gap-4 py-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{todayCount}</p>
                  <p className="text-xs text-muted-foreground">{t('today')}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-panel">
              <CardContent className="flex items-center gap-4 py-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{completed.length}</p>
                  <p className="text-xs text-muted-foreground">{t('completed')}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-panel">
              <CardContent className="flex items-center gap-4 py-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{avgMinutes !== null ? `${avgMinutes}m` : '—'}</p>
                  <p className="text-xs text-muted-foreground">{t('avgTime')}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-panel mt-6">
            <CardContent className="py-5">
              <p className="mb-3 text-sm font-semibold">{t('recent')}</p>
              {deliveries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
              ) : (
                <div className="space-y-2">
                  {deliveries.slice(0, 5).map((d) => (
                    <div key={d.sid} className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{d.address}</span>
                      </div>
                      <Badge variant="outline" className={d.stage === 'delivered' ? STATUS_STYLE.on_duty : STATUS_STYLE.on_break}>
                        {tNav(`dashboard.delivery.stage.${d.stage}`)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
