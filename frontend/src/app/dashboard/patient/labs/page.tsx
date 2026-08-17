'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TestTubes, CalendarDays, FileText, FlaskConical, Stethoscope, ShieldCheck, Download } from 'lucide-react';
import { patientLabOrders, PatientLabOrder, labTestsCatalog, LabTestItem } from '@/lib/api';
import InitialsAvatar, { resolveImageUrl } from '@/components/InitialsAvatar';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

// Mirror of backend `_short_code()` so the badge matches the order
// number printed inside the PDF.
function formatLabCode(sid: string): string {
  const s = sid.toUpperCase();
  return `CHO-LAB-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

const statusColors: Record<string, string> = {
  Ordered: 'bg-blue-50 text-blue-700 border-blue-200',
  'Sample Collected': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Processing: 'bg-amber-50 text-amber-700 border-amber-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
};

interface Toast {
  kind: 'success' | 'error';
  text: string;
}

export default function LabsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations('dashboard.patient.labsPage');

  const [labOrders, setLabOrders] = useState<PatientLabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  // Auth guard
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadLabOrders = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('access_token') || '';
    try {
      const list = await patientLabOrders.list(token);
      setLabOrders(list);
    } catch {
      setLabOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadLabOrders();
  }, [user, loadLabOrders]);

  const handleDownloadPdf = async (orderSid: string) => {
    try {
      const token = localStorage.getItem('access_token') || '';
      await patientLabOrders.downloadPdf(orderSid, token);
    } catch {
      setToast({ kind: 'error', text: t('downloadError') });
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <TestTubes className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
      </div>

      {toast && (
        <div
          className={`mb-4 rounded-md border px-4 py-3 text-sm ${
            toast.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {toast.text}
        </div>
      )}

      <Tabs defaultValue="orders">
        <TabsList className="mb-6">
          <TabsTrigger value="orders">{t('tabOrders')}</TabsTrigger>
          <TabsTrigger value="book">{t('tabBook')}</TabsTrigger>
        </TabsList>

        {/* ========== Tab: My Lab Orders ========== */}
        <TabsContent value="orders">
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : labOrders.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <p className="mt-4 text-sm font-medium text-muted-foreground">{t('noOrders')}</p>
                <p className="text-xs text-muted-foreground/60">{t('noOrdersHint')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {labOrders.map((order) => (
                <Card key={order.sid}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-sm">{t('labOrder')}</CardTitle>
                        <Badge variant="outline" className={statusColors[order.status] || ''}>
                          {order.status}
                        </Badge>
                        {order.is_prescribed && (
                          <Badge
                            variant="secondary"
                            className="bg-emerald-50 text-[10px] text-emerald-700"
                          >
                            {t('prescribedFree')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(order.ordered_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            timeZone: 'America/New_York',
                          })}
                        </span>
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                          {formatLabCode(order.sid)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={() => handleDownloadPdf(order.sid)}
                        >
                          <Download className="h-3 w-3" />
                          {t('downloadPdf')}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">{t('test')}</TableHead>
                          <TableHead className="text-xs">{t('category')}</TableHead>
                          <TableHead className="text-xs">{t('result')}</TableHead>
                          <TableHead className="text-right text-xs">{t('action')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {order.items.map((item) => (
                          <TableRow key={item.sid}>
                            <TableCell className="text-sm font-medium">{item.test_name}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-[10px]">
                                {item.test_category}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {item.has_result ? (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                                >
                                  {t('resultAvailable')}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {t('resultPending')}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {/* Per-item CTA:
                                  — Already claimed (appointment booked) → pill.
                                  — Still unclaimed → link to the proper booking
                                    flow (pick staff, day, slot). The backend
                                    recognises the active Rx and makes it free. */}
                              {item.is_claimed ? (
                                <Badge
                                  variant="outline"
                                  className="border-gray-200 bg-gray-50 text-[10px] text-gray-600"
                                >
                                  {t('alreadyBooked')}
                                </Badge>
                              ) : (
                                <Link href={`/dashboard/patient/book-lab/${item.test_sid}`}>
                                  <Button size="sm" className="h-7 text-xs">
                                    <CalendarDays className="mr-1 h-3 w-3" />
                                    {t('bookFreeAppointment')}
                                  </Button>
                                </Link>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ========== Tab: Available Tests (read-only catalog) ========== */}
        <TabsContent value="book">
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {t('labCatalogHint')}
          </div>
          <LabCatalogList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Read-only catalog of the LabTests the hospital offers. Patients cannot
 * book these directly — they must receive a prescription from a doctor.
 * Each card has a "Book a consultation" CTA that leads to the services list.
 */
function LabCatalogList() {
  const t = useTranslations('dashboard.patient.labsPage');
  const [tests, setTests] = useState<LabTestItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Send the token so the backend annotates `has_active_prescription` per
    // item, used to render the "Free for you" badge on labs the patient
    // already has a doctor's order for.
    const token = localStorage.getItem('access_token') || undefined;
    labTestsCatalog
      .list({ token })
      .then(setTests)
      .catch(() => setTests([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-48 w-full rounded-xl" />;

  if (tests.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <FlaskConical className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">{t('noLabServices')}</p>
          <p className="text-xs text-muted-foreground/60">{t('noLabServicesHint')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tests.map((test) => {
        const testImage = resolveImageUrl(test.image, API_BASE);
        const isOtc = !test.requires_prescription;
        const hasRx = !!test.has_active_prescription;
        const isFree = hasRx && test.free_when_prescribed;
        // Patient can book directly when:
        //   - the lab is OTC (no Rx required), or
        //   - the lab is Rx-required AND the patient has an active prescription
        //     (so the backend will let them book free).
        const canBookDirect = isOtc || hasRx;
        return (
          <Card key={test.sid} className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
            {testImage ? (
              <div className="flex h-40 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
                <img
                  src={testImage}
                  alt={test.name}
                  className="h-full w-full object-cover object-center"
                />
              </div>
            ) : (
              <InitialsAvatar
                src={null}
                name={test.name}
                mode="words"
                shape="square"
                variant="teal"
                className="h-40 w-full"
                textClassName="text-4xl tracking-wider"
              />
            )}

            <CardContent className="flex flex-1 flex-col p-5">
              <div className="mb-2 flex items-center gap-2">
                <FlaskConical className="h-5 w-5 shrink-0 text-teal-600" />
                <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold">{test.name}</h3>
              </div>
              <p className="line-clamp-2 min-h-[2.5rem] text-xs text-muted-foreground">
                {test.description || ''}
              </p>

              {/* Type + free-for-you badges */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {test.requires_prescription ? (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                    {t('badgeRxRequired')}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-gray-200 bg-gray-50 text-[10px] text-gray-600">
                    {t('badgeBookableDirectly')}
                  </Badge>
                )}
                {isFree && (
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1 bg-emerald-100 text-[10px] text-emerald-700"
                    title={t('badgeFreeForYouHint')}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {t('badgeFreeForYou')}
                  </Badge>
                )}
              </div>

              <div className="mt-auto pt-3">
                <div className="flex items-center justify-between">
                  {isFree ? (
                    <p className="text-lg font-bold text-emerald-700">
                      $0.00{' '}
                      <span className="text-xs font-normal text-muted-foreground line-through">
                        ${test.cost}
                      </span>
                    </p>
                  ) : (
                    <p className="text-lg font-bold">${test.cost}</p>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    {test.category}
                  </Badge>
                </div>
                {canBookDirect ? (
                  <Link
                    href={`/dashboard/patient/book-lab/${test.sid}`}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    {isFree ? t('bookFreeAppointment') : t('bookNowCta')}
                  </Link>
                ) : (
                  <Link
                    href="/dashboard/patient/services"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-primary bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                  >
                    <Stethoscope className="h-3.5 w-3.5" />
                    {t('bookConsultationCta')}
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
