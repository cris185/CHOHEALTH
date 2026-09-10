'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { deliveryPerson as deliveryPersonApi, DeliveryHistoryItem } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Truck, Package, MapPin, Check } from 'lucide-react';

const STAGE_COLORS: Record<string, string> = {
  picked_up: 'bg-slate-50 text-slate-700 border-slate-200',
  on_the_way: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function DeliveryHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations('dashboard.delivery.historyPage');
  const tStage = useTranslations('dashboard.delivery.stage');

  const [deliveries, setDeliveries] = useState<DeliveryHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Delivery') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token') || '';
      const list = await deliveryPersonApi.deliveries(token);
      setDeliveries(list);
    } catch {
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Truck className="h-6 w-6 text-primary" />
        <h1 className="section-title text-2xl font-bold tracking-tight">{t('title')}</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : deliveries.length === 0 ? (
        <Card className="glass-panel">
          <CardContent className="py-16 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">{t('empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {deliveries.map((d) => {
            const isDelivered = d.stage === 'delivered';
            return (
              <Card key={d.sid} className="glass-panel">
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      isDelivered ? 'bg-emerald-100 text-emerald-700' : 'bg-primary/10 text-primary'
                    }`}>
                      {isDelivered ? <Check className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 text-sm font-medium text-gray-900">
                        <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{d.address}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(d.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York',
                        })}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className={STAGE_COLORS[d.stage] || ''}>
                    {tStage(d.stage)}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
