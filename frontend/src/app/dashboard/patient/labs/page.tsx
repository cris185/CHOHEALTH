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
import { TestTubes, CalendarDays, FileText, FlaskConical } from 'lucide-react';
import { patientLabOrders, PatientLabOrder } from '@/lib/api';
import BookPrescribedLabModal from '@/components/labs/BookPrescribedLabModal';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface LabService {
  sid: string;
  name: string;
  description: string;
  image: string;
  cost: string;
  duration_minutes: number;
  service_type: string;
  doctors_count: number;
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
  const [bookTarget, setBookTarget] = useState<string | null>(null);
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

  const handleBookSuccess = () => {
    setToast({ kind: 'success', text: t('bookSuccess') });
    loadLabOrders();
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
                    <div className="flex items-center justify-between">
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
                      <span className="text-xs text-muted-foreground">
                        {new Date(order.ordered_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">{t('test')}</TableHead>
                          <TableHead className="text-xs">{t('category')}</TableHead>
                          <TableHead className="text-xs">{t('result')}</TableHead>
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
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {order.is_prescribed && order.status === 'Ordered' && (
                      <div className="mt-3 flex justify-end">
                        <Button
                          size="sm"
                          className="text-xs"
                          onClick={() => setBookTarget(order.sid)}
                        >
                          <CalendarDays className="mr-1 h-3 w-3" />
                          {t('bookFreeAppointment')}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ========== Tab: Book Lab Test (existing self-pay flow) ========== */}
        <TabsContent value="book">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">{t('labServicesHint')}</p>
          </div>
          <LabServiceList />
        </TabsContent>
      </Tabs>

      <BookPrescribedLabModal
        isOpen={!!bookTarget}
        onClose={() => setBookTarget(null)}
        labOrderSid={bookTarget}
        onSuccess={handleBookSuccess}
      />
    </div>
  );
}

function LabServiceList() {
  const t = useTranslations('dashboard.patient.labsPage');
  const [services, setServices] = useState<LabService[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/services/`)
      .then((r) => r.json())
      .then((data) => {
        const labServices = (data.results || data).filter(
          (s: LabService) => s.service_type === 'Lab',
        );
        setServices(labServices);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-48 w-full rounded-xl" />;

  if (services.length === 0) {
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
      {services.map((s) => (
        <Link key={s.sid} href={`/dashboard/patient/services/${s.sid}`}>
          <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
            <CardContent className="p-5">
              <div className="mb-2 flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-teal-600" />
                <h3 className="text-sm font-semibold">{s.name}</h3>
              </div>
              {s.description && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
              )}
              <div className="mt-3 flex items-center justify-between">
                <p className="text-lg font-bold">${s.cost}</p>
                <Badge variant="secondary" className="text-[10px]">
                  {s.duration_minutes} min
                </Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
