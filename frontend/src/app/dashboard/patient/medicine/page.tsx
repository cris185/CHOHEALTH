'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Pill, ShoppingCart, FileText, Truck, MapPin, ExternalLink } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface PrescriptionItem {
  sid: string;
  medication_name: string;
  is_system_medication: boolean;
  dosage: string;
  frequency: string;
  duration_days: number;
  instructions: string;
  delivery_method: string;
  delivery_status: string;
}

interface MedicalRecord {
  sid: string;
  diagnosis: string;
  doctor_name: string;
  prescription: { sid: string; items: PrescriptionItem[]; additional_notes: string } | null;
  created_at: string;
}

interface MedicationCatalog {
  sid: string;
  name: string;
  generic_name: string;
  category: string;
  dosage_form: string;
  strength: string;
  cost: string;
  requires_prescription: boolean;
}

const deliveryColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  ready: 'bg-blue-50 text-blue-700 border-blue-200',
  dispatched: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  collected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function MedicinePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [catalog, setCatalog] = useState<MedicationCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('access_token') || '';

    // Fetch medical records with prescriptions
    fetch(`${API_URL}/patient/medical-records/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        // Fetch details for records that have prescriptions
        const detailPromises = (data.results || data).filter((r: MedicalRecord) => r.prescription !== undefined)
          .map((r: MedicalRecord) =>
            fetch(`${API_URL}/patient/medical-records/${r.sid}/`, { headers: { Authorization: `Bearer ${token}` } }).then(res => res.json())
          );
        return Promise.all(detailPromises);
      })
      .then(details => setRecords(details.filter(d => d.prescription)))
      .catch(() => {})
      .finally(() => setLoading(false));

    // Fetch medication catalog (non-prescription only)
    fetch(`${API_URL}/medicine-catalog/`)
      .then(r => r.json())
      .then(setCatalog)
      .catch(() => {})
      .finally(() => setCatalogLoading(false));
  }, [user]);

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Pill className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold tracking-tight">Medicine</h2>
      </div>

      <Tabs defaultValue="prescriptions">
        <TabsList className="mb-6">
          <TabsTrigger value="prescriptions">My Prescriptions</TabsTrigger>
          <TabsTrigger value="buy">Buy Medicine</TabsTrigger>
        </TabsList>

        {/* My Prescriptions */}
        <TabsContent value="prescriptions">
          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
          ) : records.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <p className="mt-4 text-sm font-medium text-muted-foreground">No prescriptions yet</p>
                <p className="text-xs text-muted-foreground/60">Your doctor will create prescriptions after appointments.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {records.map(record => (
                <Card key={record.sid}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{record.doctor_name}</CardTitle>
                      <span className="text-xs text-muted-foreground">{new Date(record.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{record.diagnosis}</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {record.prescription?.items.map(item => (
                      <div key={item.sid} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{item.medication_name}</p>
                            {item.is_system_medication ? (
                              <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700">Free</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">External</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{item.dosage} &middot; {item.frequency} &middot; {item.duration_days} days</p>
                          {item.instructions && <p className="text-xs text-muted-foreground mt-1">{item.instructions}</p>}
                        </div>
                        <div className="ml-4 shrink-0">
                          {item.is_system_medication ? (
                            <div className="flex items-center gap-2">
                              {item.delivery_method === 'external' ? (
                                <div className="flex gap-1">
                                  <Button variant="outline" size="sm" className="text-xs h-7">
                                    <MapPin className="mr-1 h-3 w-3" /> Pickup
                                  </Button>
                                  <Button variant="outline" size="sm" className="text-xs h-7">
                                    <Truck className="mr-1 h-3 w-3" /> Delivery
                                  </Button>
                                </div>
                              ) : (
                                <Badge variant="outline" className={deliveryColors[item.delivery_status] || ''}>
                                  {item.delivery_status}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <ExternalLink className="h-3 w-3" /> Buy at pharmacy
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Buy Medicine */}
        <TabsContent value="buy">
          {catalogLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
            </div>
          ) : catalog.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <p className="mt-4 text-sm font-medium text-muted-foreground">No medications available for purchase</p>
                <p className="text-xs text-muted-foreground/60">Over-the-counter medications will appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.map(med => (
                <Card key={med.sid} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">{med.name}</h3>
                        {med.generic_name && <p className="text-xs text-muted-foreground">{med.generic_name}</p>}
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{med.category}</Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{med.dosage_form}</span>
                      {med.strength && <span>&middot; {med.strength}</span>}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-lg font-bold">${med.cost}</p>
                      <Button size="sm" className="h-8 text-xs">
                        <ShoppingCart className="mr-1 h-3 w-3" /> Add to Cart
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
