'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TestTubes, CalendarDays, FileText, FlaskConical } from 'lucide-react';
import Link from 'next/link';
import ServiceList from '@/components/ServiceList';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface LabOrderItem {
  sid: string;
  test_name: string;
  test_category: string;
  has_result: boolean;
}

interface LabOrderData {
  sid: string;
  status: string;
  is_prescribed: boolean;
  notes: string;
  items: LabOrderItem[];
  ordered_at: string;
}

const statusColors: Record<string, string> = {
  Ordered: 'bg-blue-50 text-blue-700 border-blue-200',
  'Sample Collected': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Processing: 'bg-amber-50 text-amber-700 border-amber-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
};

export default function LabsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [labOrders, setLabOrders] = useState<LabOrderData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('access_token') || '';

    fetch(`${API_URL}/patient/lab-orders/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setLabOrders(data.results || data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <TestTubes className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold tracking-tight">Labs</h2>
      </div>

      <Tabs defaultValue="orders">
        <TabsList className="mb-6">
          <TabsTrigger value="orders">My Lab Orders</TabsTrigger>
          <TabsTrigger value="book">Book Lab Test</TabsTrigger>
        </TabsList>

        {/* My Lab Orders */}
        <TabsContent value="orders">
          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
          ) : labOrders.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <p className="mt-4 text-sm font-medium text-muted-foreground">No lab orders yet</p>
                <p className="text-xs text-muted-foreground/60">Your doctor will order lab tests after appointments, or you can book directly.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {labOrders.map(order => (
                <Card key={order.sid}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm">Lab Order</CardTitle>
                        <Badge variant="outline" className={statusColors[order.status] || ''}>{order.status}</Badge>
                        {order.is_prescribed && (
                          <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700">Prescribed (Free)</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(order.ordered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Test</TableHead>
                          <TableHead className="text-xs">Category</TableHead>
                          <TableHead className="text-xs">Result</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {order.items.map(item => (
                          <TableRow key={item.sid}>
                            <TableCell className="text-sm font-medium">{item.test_name}</TableCell>
                            <TableCell><Badge variant="secondary" className="text-[10px]">{item.test_category}</Badge></TableCell>
                            <TableCell>
                              {item.has_result ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Available</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Pending</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {order.is_prescribed && order.status === 'Ordered' && (
                      <div className="mt-3 flex justify-end">
                        <Link href="/dashboard/patient/services">
                          <Button size="sm" className="text-xs">
                            <CalendarDays className="mr-1 h-3 w-3" /> Book Lab Appointment
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Book Lab Test (uses existing services with type='Lab') */}
        <TabsContent value="book">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">Browse available lab tests and book an appointment at a branch near you.</p>
          </div>
          <LabServiceList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LabServiceList() {
  const [services, setServices] = useState<Array<{sid: string; name: string; description: string; image: string; cost: string; duration_minutes: number; service_type: string; doctors_count: number}>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/services/`)
      .then(r => r.json())
      .then(data => {
        const labServices = (data.results || data).filter((s: {service_type: string}) => s.service_type === 'Lab');
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
          <p className="mt-4 text-sm font-medium text-muted-foreground">No lab services available</p>
          <p className="text-xs text-muted-foreground/60">Lab test services will appear here when added.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {services.map(s => (
        <Link key={s.sid} href={`/dashboard/patient/services/${s.sid}`}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <FlaskConical className="h-5 w-5 text-teal-600" />
                <h3 className="text-sm font-semibold">{s.name}</h3>
              </div>
              {s.description && <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
              <div className="mt-3 flex items-center justify-between">
                <p className="text-lg font-bold">${s.cost}</p>
                <Badge variant="secondary" className="text-[10px]">{s.duration_minutes} min</Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
