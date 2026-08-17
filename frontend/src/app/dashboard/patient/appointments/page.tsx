'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { appointments as appointmentsApi, doctors as doctorsApi, AppointmentItem } from '@/lib/api';
import { useBfcacheRefetch } from '@/hooks/useBfcacheRefetch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarDays } from 'lucide-react';
import CancelAppointmentModal from '@/components/booking/CancelAppointmentModal';
import RescheduleModal from '@/components/booking/RescheduleModal';
import PaymentModal from '@/components/booking/PaymentModal';

const statusVariant: Record<string, string> = {
  Unpaid: 'bg-amber-50 text-amber-700 border-amber-200',
  Confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  Completed: 'bg-slate-100 text-slate-600 border-slate-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
  'No Show': 'bg-orange-50 text-orange-700 border-orange-200',
};

const statusLabel: Record<string, string> = {
  Unpaid: 'Awaiting Payment',
};

export default function PatientAppointmentsPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();
  const [appts, setAppts] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [cancelTarget, setCancelTarget] = useState<AppointmentItem | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentItem | null>(null);
  const [payTarget, setPayTarget] = useState<AppointmentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppointmentItem | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshList = useCallback(() => {
    // Cancela cualquier fetch anterior todavía en vuelo para evitar estados
    // inconsistentes si la lista se vuelve a pedir mientras el primer fetch
    // aún no ha resuelto.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const token = localStorage.getItem('access_token') || '';
    setLoading(true);
    appointmentsApi.list(token, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setAppts(data); })
      .catch((err: unknown) => {
        const name = (err as { name?: string })?.name;
        if (name === 'AbortError') return;
        if (!controller.signal.aborted) setAppts([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, []);

  useEffect(() => {
    if (user) refreshList();
    return () => abortRef.current?.abort();
  }, [user, refreshList]);

  // Reconcilia el estado cuando la página vuelve del bfcache (botón "atrás"
  // desde Stripe/PayPal). Sin esto, la vista queda atascada en loading=true
  // porque React no se remonta y el fetch previo fue abortado durante el unload.
  useBfcacheRefetch(useCallback(() => {
    if (user) refreshList();
  }, [user, refreshList]));

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleCancel = async (sid: string, reason: string) => {
    const token = localStorage.getItem('access_token') || '';
    const res = await appointmentsApi.cancel(sid, reason, token);
    setToast({
      kind: 'success',
      text: Number(res.refund_amount) > 0
        ? `Appointment cancelled. Refund of $${res.refund_amount} is being processed.`
        : 'Appointment cancelled.',
    });
    refreshList();
  };

  const handleReschedule = async (sid: string, dateTimeIso: string) => {
    const token = localStorage.getItem('access_token') || '';
    await appointmentsApi.reschedule(sid, dateTimeIso, token);
    setToast({ kind: 'success', text: 'Appointment rescheduled successfully.' });
    refreshList();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const token = localStorage.getItem('access_token') || '';
    try {
      await appointmentsApi.delete(deleteTarget.sid, token);
      setToast({ kind: 'success', text: 'Unpaid appointment deleted.' });
      setDeleteTarget(null);
      refreshList();
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string } };
      setToast({ kind: 'error', text: apiError?.data?.detail || 'Could not delete the appointment.' });
      setDeleteTarget(null);
    }
  };

  const handlePaymentSuccess = () => {
    setPayTarget(null);
    setToast({ kind: 'success', text: 'Payment successful. Your appointment is confirmed.' });
    refreshList();
  };

  const canCancelWithRefund = (a: AppointmentItem) =>
    a.status === 'Confirmed' && new Date(a.date) > new Date();

  const canReschedule = (a: AppointmentItem) =>
    (a.status === 'Unpaid' || a.status === 'Confirmed') && new Date(a.date) > new Date();

  const isUnpaid = (a: AppointmentItem) => a.status === 'Unpaid';

  const filtered = filter === 'all' ? appts : appts.filter((a) => a.status === filter);

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <CalendarDays className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold tracking-tight">{t('dashboard.patient.appointments')}</h2>
      </div>

      {toast && (
        <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${
          toast.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {toast.text}
        </div>
      )}

      <Tabs value={filter} onValueChange={setFilter} className="mb-6">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="Unpaid">Unpaid</TabsTrigger>
          <TabsTrigger value="Confirmed">Confirmed</TabsTrigger>
          <TabsTrigger value="Completed">Completed</TabsTrigger>
          <TabsTrigger value="Cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No appointments found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.sid}>
                    <TableCell className="font-medium">
                      {new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
                    </TableCell>
                    <TableCell>{a.doctor_name}</TableCell>
                    <TableCell>{a.service_name || '-'}</TableCell>
                    <TableCell>{a.mode}</TableCell>
                    <TableCell>{a.branch_name || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusVariant[a.status] || ''}>
                        {statusLabel[a.status] || a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {isUnpaid(a) ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={async () => {
                              // Re-check the slot before opening the payment
                              // modal so we fail fast if someone grabbed it
                              // while this appointment sat Unpaid.
                              if (a.doctor_sid && a.service_sid) {
                                try {
                                  const d = a.date.slice(0, 10);
                                  const tm = new Date(a.date).toTimeString().slice(0, 5);
                                  const slots = await doctorsApi.availableSlots(
                                    a.doctor_sid, d, { serviceSid: a.service_sid },
                                  );
                                  const target = slots.slots.find((s) => s.time === tm);
                                  if (!target || !target.available) {
                                    setToast({ kind: 'error', text: t('booking.slotTaken') });
                                    return;
                                  }
                                } catch {
                                  // Let the server have the final say on failures.
                                }
                              }
                              setPayTarget(a);
                            }}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            Pay Now
                          </Button>
                          {canReschedule(a) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRescheduleTarget(a)}
                              disabled={!a.doctor_sid || !a.service_sid}
                            >
                              Reschedule
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteTarget(a)}
                            className="border-red-200 text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </Button>
                        </div>
                      ) : canCancelWithRefund(a) ? (
                        <div className="flex justify-end gap-2">
                          {a.mode === 'Virtual' && a.status === 'In Progress' && a.meeting_link && (
                            <a
                              href={a.meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-9 items-center rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              {t('booking.joinMeeting')}
                            </a>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRescheduleTarget(a)}
                            disabled={!a.doctor_sid || !a.service_sid}
                          >
                            Reschedule
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCancelTarget(a)}
                            className="border-red-200 text-red-600 hover:bg-red-50"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : a.mode === 'Virtual' && a.status === 'In Progress' && a.meeting_link ? (
                        <div className="flex justify-end">
                          <a
                            href={a.meeting_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-9 items-center rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            {t('booking.joinMeeting')}
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {cancelTarget && (
        <CancelAppointmentModal
          isOpen={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
          appointmentSid={cancelTarget.sid}
          appointmentDate={cancelTarget.date}
          invoiceStatus={cancelTarget.invoice_status}
          onCancel={handleCancel}
          actorRole="patient"
        />
      )}

      {rescheduleTarget && (
        <RescheduleModal
          isOpen={!!rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          appointmentSid={rescheduleTarget.sid}
          doctorSid={rescheduleTarget.doctor_sid}
          serviceSid={rescheduleTarget.service_sid}
          currentDate={rescheduleTarget.date}
          onReschedule={handleReschedule}
        />
      )}

      {payTarget && (
        <PaymentModal
          isOpen={!!payTarget}
          onClose={() => setPayTarget(null)}
          target={{ kind: 'appointment', appointmentSid: payTarget.sid }}
          amount={payTarget.service_cost}
          serviceName={payTarget.service_name || 'Appointment'}
          subtitle={new Date(payTarget.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b p-4">
              <h2 className="text-lg font-bold text-gray-900">Delete unpaid appointment?</h2>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-600">
                This will permanently remove your unpaid appointment with <strong>{deleteTarget.doctor_name}</strong> on{' '}
                <strong>{new Date(deleteTarget.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}</strong>.
              </p>
              <p className="text-xs text-gray-500">
                No payment was charged, so nothing will be refunded. You can book a new appointment anytime.
              </p>
            </div>
            <div className="border-t p-4 flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Keep
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
