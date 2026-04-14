'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { medicineDelivery, DeliveryTrackingResponse } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Truck, Warehouse, PackageCheck, MapPin, Home, Check } from 'lucide-react';

const POLL_INTERVAL_MS = 3000;

type Stage = DeliveryTrackingResponse['stage'];

/**
 * Five stages the tracker advances through. Order MUST match the backend's
 * `STAGE_ORDER`. We repaint the progress bar based on `stage_index` returned
 * by the polling endpoint — no client-side timers.
 */
const STAGES: Array<{ key: Stage; icon: typeof Truck }> = [
  { key: 'picked_up', icon: Warehouse },
  { key: 'left_origin', icon: PackageCheck },
  { key: 'on_the_way', icon: Truck },
  { key: 'arriving_soon', icon: MapPin },
  { key: 'delivered', icon: Home },
];

export default function DeliveryTrackingPage() {
  const { orderSid } = useParams<{ orderSid: string }>();
  const router = useRouter();
  const t = useTranslations('dashboard.patient.deliveryPage');
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<DeliveryTrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, authLoading, router]);

  const fetchTracking = useCallback(async () => {
    if (!orderSid) return;
    try {
      const token = localStorage.getItem('access_token') || '';
      const res = await medicineDelivery.tracking(orderSid, token);
      setData(res);
      setError('');
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string } };
      setError(apiError.data?.detail || t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [orderSid, t]);

  // Kick off + poll every 3s. Stop polling once delivered.
  useEffect(() => {
    if (!user) return;
    fetchTracking();
    timerRef.current = setInterval(fetchTracking, POLL_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [user, fetchTracking]);

  useEffect(() => {
    if (data?.stage === 'delivered' && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [data?.stage]);

  if (authLoading || !user) return null;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-40 w-full rounded-xl" />
        <Skeleton className="mt-4 h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {error || t('notFound')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentIndex = data.stage_index;
  const progressPercent = (currentIndex / (STAGES.length - 1)) * 100;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('orderRef')}: <span className="font-mono text-xs">{data.order_sid.slice(0, 8).toUpperCase()}</span>
        </p>
      </div>

      {/* Progress bar */}
      <Card className="mb-6">
        <CardContent className="py-8">
          <div className="relative">
            {/* Track */}
            <div className="absolute left-6 right-6 top-6 h-1 rounded bg-gray-200" />
            {/* Fill */}
            <div
              className="absolute left-6 top-6 h-1 rounded bg-emerald-500 transition-all duration-700"
              style={{ width: `calc(${progressPercent}% - ${progressPercent === 100 ? '0px' : '3rem'})` }}
            />
            <ul className="relative flex items-start justify-between">
              {STAGES.map((stage, idx) => {
                const Icon = stage.icon;
                const isDone = idx < currentIndex;
                const isActive = idx === currentIndex;
                const isUpcoming = idx > currentIndex;
                return (
                  <li key={stage.key} className="flex flex-col items-center text-center" style={{ width: '20%' }}>
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-colors ${
                        isDone
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : isActive
                            ? 'border-emerald-500 bg-white text-emerald-600 animate-pulse'
                            : 'border-gray-300 bg-white text-gray-400'
                      }`}
                    >
                      {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <p
                      className={`mt-2 text-xs font-medium ${
                        isUpcoming ? 'text-gray-400' : 'text-gray-900'
                      }`}
                    >
                      {t(`stage.${stage.key}`)}
                    </p>
                    {isActive && stage.key === 'picked_up' && data.origin_branch && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{data.origin_branch}</p>
                    )}
                    {isActive && stage.key === 'delivered' && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{data.address}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Address block */}
      <Card className="mb-6">
        <CardContent className="py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('fromLabel')}
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">{data.origin_branch || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('toLabel')}
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">{data.address}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardContent className="py-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">{t('itemsInOrder')}</h2>
          <ul className="divide-y divide-gray-100">
            {data.items.map((item) => (
              <li key={item.sid} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{item.name}</p>
                  {item.strength && <p className="text-xs text-muted-foreground">{item.strength} · {item.dosage_form}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">x{item.quantity}</p>
                  {Number(item.unit_price) > 0 ? (
                    <p className="text-xs font-semibold text-gray-900">${item.total}</p>
                  ) : (
                    <p className="text-xs font-semibold text-emerald-700">{t('covered')}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {Number(data.shipping_fee) > 0 && (
            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
              <span className="text-gray-700">{t('shippingFee')}</span>
              <span className="font-semibold text-gray-900">${data.shipping_fee}</span>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
            <span className="font-semibold text-gray-900">{t('totalPaid')}</span>
            <span className="font-bold text-gray-900">${data.total}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
