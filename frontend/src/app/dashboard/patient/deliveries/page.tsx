'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { medicineDelivery, DeliveryListItem } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Truck, Package, MapPin, Check } from 'lucide-react';

const STAGE_COLORS: Record<string, string> = {
  picked_up: 'bg-slate-50 text-slate-700 border-slate-200',
  left_origin: 'bg-blue-50 text-blue-700 border-blue-200',
  on_the_way: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  arriving_soon: 'bg-amber-50 text-amber-700 border-amber-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function PatientDeliveriesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations('dashboard.patient.deliveriesPage');
  const tStage = useTranslations('dashboard.patient.deliveryPage.stage');

  const [deliveries, setDeliveries] = useState<DeliveryListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token') || '';
      const list = await medicineDelivery.list(token);
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
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : deliveries.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">{t('empty')}</p>
            <p className="text-xs text-muted-foreground/60">{t('emptyHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {deliveries.map((d) => {
            const stageKey = d.stage || 'picked_up';
            const isDelivered = d.stage === 'delivered';
            return (
              <Link
                key={d.order_sid}
                href={`/dashboard/patient/delivery/${d.order_sid}`}
                className="block"
              >
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="py-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                          isDelivered ? 'bg-emerald-100 text-emerald-700' : 'bg-primary/10 text-primary'
                        }`}>
                          {isDelivered ? <Check className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">
                            {t('orderCountLine', { count: d.item_count })}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{d.address}</span>
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {new Date(d.created_at).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York',
                            })}
                            {d.origin_branch && ` · ${d.origin_branch}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className={STAGE_COLORS[stageKey] || ''}>
                          {tStage(stageKey as 'picked_up' | 'left_origin' | 'on_the_way' | 'arriving_soon' | 'delivered')}
                        </Badge>
                        <span className="text-xs font-semibold text-gray-900">${d.total}</span>
                      </div>
                    </div>

                    {d.stage_index !== null && (
                      <div className="mt-3 h-1 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={`h-full transition-all duration-500 ${isDelivered ? 'bg-emerald-500' : 'bg-primary'}`}
                          style={{ width: `${((d.stage_index + 1) / d.total_stages) * 100}%` }}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
