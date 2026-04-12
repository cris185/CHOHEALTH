'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Pill, ShoppingCart, FileText, ExternalLink, ShieldCheck, Package, Check,
} from 'lucide-react';
import {
  patientMedicalRecords,
  medicineCatalog,
  medicineOrders,
  MedicineCatalogItem,
  PatientMedicalRecordDetail,
  PatientMedicalRecordListItem,
  MedicineOrderCreateResponse,
  MedicineOrderListItem,
} from '@/lib/api';
import CartCheckoutModal from '@/components/medicine/CartCheckoutModal';
import OrderPickupCode from '@/components/medicine/OrderPickupCode';
import PaymentModal from '@/components/booking/PaymentModal';

const deliveryColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  ready: 'bg-blue-50 text-blue-700 border-blue-200',
  dispatched: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  collected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const ORDER_STATUS_I18N = {
  'Pending Payment': 'Pending',
  'Paid': 'Paid',
  'Processing': 'Processing',
  'Ready for Pickup': 'Ready',
  'Dispatched': 'Dispatched',
  'Delivered': 'Delivered',
  'Collected': 'Collected',
  'Cancelled': 'Cancelled',
} as const;

interface PayOrderData {
  orderSid: string;
  total: string;
  serviceName: string;
}

interface Toast { kind: 'success' | 'error'; text: string }

export default function MedicinePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations('dashboard.patient.medicinePage');
  const cart = useCart();

  const [records, setRecords] = useState<PatientMedicalRecordDetail[]>([]);
  const [catalog, setCatalog] = useState<MedicineCatalogItem[]>([]);
  const [orders, setOrders] = useState<MedicineOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payOrderData, setPayOrderData] = useState<PayOrderData | null>(null);
  // Track which meds were just added to cart (for brief "Added" feedback).
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());

  // Auth guard
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Data loaders
  const loadRecords = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('access_token') || '';
    try {
      const list = await patientMedicalRecords.list(token);
      const withRx = list.filter((r: PatientMedicalRecordListItem) => r.has_prescription);
      const details = await Promise.all(
        withRx.map((r) => patientMedicalRecords.detail(r.sid, token).catch(() => null)),
      );
      setRecords(details.filter((d): d is PatientMedicalRecordDetail => d !== null && d.prescription !== null));
    } catch { setRecords([]); } finally { setLoading(false); }
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      setCatalog(await medicineCatalog.list({ includePrescription: true }));
    } catch { setCatalog([]); } finally { setCatalogLoading(false); }
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    const token = localStorage.getItem('access_token') || '';
    try { setOrders(await medicineOrders.list(token)); }
    catch { setOrders([]); } finally { setOrdersLoading(false); }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadRecords();
    loadCatalog();
    loadOrders();
  }, [user, loadRecords, loadCatalog, loadOrders]);

  /** Medication sids for which the patient has an unclaimed prescription (free). */
  const freeMedicationSids = useMemo(() => {
    const set = new Set<string>();
    for (const record of records) {
      for (const item of record.prescription?.items ?? []) {
        if (item.is_system_medication && !item.is_claimed && item.medication_sid && item.medication_info?.free_when_prescribed) {
          set.add(item.medication_sid);
        }
      }
    }
    return set;
  }, [records]);

  /** Map medication_sid → catalog entry (for the "Claim" buttons). */
  const catalogBySid = useMemo(() => {
    const m = new Map<string, MedicineCatalogItem>();
    for (const med of catalog) m.set(med.sid, med);
    return m;
  }, [catalog]);

  // Cart helpers
  const handleAddToCart = (med: MedicineCatalogItem) => {
    cart.addItem(med);
    setJustAdded((prev) => { const n = new Set(prev); n.add(med.sid); return n; });
    setTimeout(() => setJustAdded((prev) => { const n = new Set(prev); n.delete(med.sid); return n; }), 1200);
  };

  // After checkout
  const handleCheckoutSuccess = (response: MedicineOrderCreateResponse) => {
    if (response.status === 'Paid') {
      setToast({ kind: 'success', text: t('successFree') });
    } else {
      setPayOrderData({
        orderSid: response.order_sid,
        total: response.total,
        serviceName: t('orderItemsCount', { count: '1' }),
      });
    }
    loadRecords();
    loadOrders();
  };

  const handlePaymentSuccess = () => {
    setPayOrderData(null);
    setToast({ kind: 'success', text: t('successPaid') });
    loadRecords();
    loadOrders();
  };

  const retryPayment = (order: MedicineOrderListItem) => {
    setPayOrderData({
      orderSid: order.sid,
      total: order.total,
      serviceName: t('orderItemsCount', { count: String(order.items_count) }),
    });
  };

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header with cart badge */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Pill className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
        </div>
        {cart.count > 0 && (
          <Button size="sm" onClick={() => setCheckoutOpen(true)} className="relative">
            <ShoppingCart className="mr-2 h-4 w-4" />
            {t('viewCart')}
            <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
              {cart.count}
            </span>
          </Button>
        )}
      </div>

      {toast && (
        <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${toast.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {toast.text}
        </div>
      )}

      <Tabs defaultValue="prescriptions">
        <TabsList className="mb-6">
          <TabsTrigger value="prescriptions">{t('tabPrescriptions')}</TabsTrigger>
          <TabsTrigger value="buy">{t('tabBuy')}</TabsTrigger>
          <TabsTrigger value="orders">{t('tabOrders')}</TabsTrigger>
        </TabsList>

        {/* ======== TAB: My Prescriptions ======== */}
        <TabsContent value="prescriptions">
          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
          ) : records.length === 0 ? (
            <Card><CardContent className="py-16 text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-4 text-sm font-medium text-muted-foreground">{t('noPrescriptions')}</p>
              <p className="text-xs text-muted-foreground/60">{t('noPrescriptionsHint')}</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-4">
              {records.map((record) => (
                <Card key={record.sid}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{t('issuedBy')}: {record.doctor_name || '—'}</CardTitle>
                      <span className="text-xs text-muted-foreground">
                        {new Date(record.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{record.diagnosis}</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {record.prescription?.items.map((item) => {
                      const catalogMed = catalogBySid.get(item.medication_sid || '');
                      const canClaim = item.is_system_medication && !item.is_claimed && catalogMed;
                      return (
                        <div key={item.sid} className="flex items-start justify-between rounded-lg border p-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium">{item.medication_name}</p>
                              {item.is_system_medication ? (
                                <Badge variant="secondary" className="flex items-center gap-1 bg-emerald-50 text-[10px] text-emerald-700">
                                  <ShieldCheck className="h-3 w-3" />{t('badgeFreeCovered')}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="flex items-center gap-1 text-[10px]">
                                  <ExternalLink className="h-3 w-3" />{t('badgeExternalPharmacy')}
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.dosage} &middot; {item.frequency} &middot; {item.duration_days} d
                            </p>
                            {item.instructions && <p className="mt-1 text-xs text-muted-foreground">{item.instructions}</p>}
                          </div>
                          <div className="ml-4 shrink-0">
                            {canClaim ? (
                              <Button size="sm" className="h-7 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                                onClick={() => handleAddToCart(catalogMed!)}>
                                {t('claimButton')}
                              </Button>
                            ) : item.is_system_medication && item.delivery_method !== 'external' ? (
                              <Badge variant="outline" className={deliveryColors[item.delivery_status] || ''}>
                                {t(`deliveryStatus.${item.delivery_status}` as 'deliveryStatus.pending' | 'deliveryStatus.ready' | 'deliveryStatus.dispatched' | 'deliveryStatus.delivered' | 'deliveryStatus.collected')}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {record.prescription?.additional_notes && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">{t('prescriptionNotes')}:</span> {record.prescription.additional_notes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ======== TAB: Buy Medicine ======== */}
        <TabsContent value="buy">
          {catalogLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
            </div>
          ) : catalog.length === 0 ? (
            <Card><CardContent className="py-16 text-center">
              <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-4 text-sm font-medium text-muted-foreground">{t('noCatalog')}</p>
              <p className="text-xs text-muted-foreground/60">{t('noCatalogHint')}</p>
            </CardContent></Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.map((med) => {
                const isFree = freeMedicationSids.has(med.sid);
                const inCart = justAdded.has(med.sid);
                return (
                  <Card key={med.sid} className="transition-shadow hover:shadow-md">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold">{med.name}</h3>
                          {med.generic_name && <p className="truncate text-xs text-muted-foreground">{med.generic_name}</p>}
                        </div>
                        <Badge variant="secondary" className="ml-2 shrink-0 text-[10px]">{med.category}</Badge>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{med.dosage_form}</span>
                        {med.strength && <span>&middot; {med.strength}</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {med.requires_prescription ? (
                          <Badge variant="outline" className="bg-amber-50 text-[10px] text-amber-700 border-amber-200">{t('badgeRxRequired')}</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-[10px] text-gray-600 border-gray-200">{t('badgeOtc')}</Badge>
                        )}
                        {isFree && (
                          <Badge variant="secondary" className="flex items-center gap-1 bg-emerald-100 text-[10px] text-emerald-700" title={t('badgeFreeForYouHint')}>
                            <ShieldCheck className="h-3 w-3" />{t('badgeFreeForYou')}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        {isFree ? (
                          <p className="text-lg font-bold text-emerald-700">$0.00 <span className="text-xs font-normal text-muted-foreground line-through">${med.cost}</span></p>
                        ) : (
                          <p className="text-lg font-bold">${med.cost}</p>
                        )}
                        <Button size="sm" className="h-8 text-xs" onClick={() => handleAddToCart(med)}>
                          {inCart ? <><Check className="mr-1 h-3 w-3" />{t('addedToCart')}</> : <><ShoppingCart className="mr-1 h-3 w-3" />{t('addToCart')}</>}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ======== TAB: My Orders ======== */}
        <TabsContent value="orders">
          {ordersLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          ) : orders.length === 0 ? (
            <Card><CardContent className="py-16 text-center">
              <Package className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-4 text-sm font-medium text-muted-foreground">{t('noOrders')}</p>
              <p className="text-xs text-muted-foreground/60">{t('noOrdersHint')}</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const isPending = order.status === 'Pending Payment';
                const statusSuffix = ORDER_STATUS_I18N[order.status as keyof typeof ORDER_STATUS_I18N] ?? 'Pending';
                const statusKey = `orderStatus${statusSuffix}` as
                  | 'orderStatusPending' | 'orderStatusPaid' | 'orderStatusProcessing'
                  | 'orderStatusReady' | 'orderStatusDispatched' | 'orderStatusDelivered'
                  | 'orderStatusCollected' | 'orderStatusCancelled';
                return (
                  <Card key={order.sid}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{t('orderItemsCount', { count: String(order.items_count) })}</span>
                          <Badge variant="outline" className={isPending ? 'border-amber-200 bg-amber-50 text-[10px] text-amber-700' : order.status === 'Cancelled' ? 'border-red-200 bg-red-50 text-[10px] text-red-700' : 'border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700'}>
                            {t(statusKey)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-right text-sm">
                            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{t('orderTotal')}</span>
                            <span className="font-bold">${order.total}</span>
                          </p>
                          {isPending && (
                            <Button size="sm" className="h-8 text-xs" onClick={() => retryPayment(order)}>
                              {t('orderPay')}
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('orderDate')}: {new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      {/* Pickup QR — only for paid orders that have a code */}
                      {order.pickup_code && !isPending && (
                        <OrderPickupCode code={order.pickup_code} compact />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Cart Checkout Modal */}
      <CartCheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={handleCheckoutSuccess}
        freeMedicationSids={freeMedicationSids}
      />

      {/* Payment Modal (for orders that need online payment) */}
      {payOrderData && (
        <PaymentModal
          isOpen={!!payOrderData}
          onClose={() => setPayOrderData(null)}
          target={{ kind: 'medicine_order', orderSid: payOrderData.orderSid }}
          amount={payOrderData.total}
          serviceName={payOrderData.serviceName}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
