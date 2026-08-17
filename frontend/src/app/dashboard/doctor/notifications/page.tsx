'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { notifications as notificationsApi, NotificationItem } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Check, Trash2 } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';

type FilterStatus = 'all' | 'unread' | 'read';
type PendingDelete = null | 'all' | { sid: string };

export default function DoctorNotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations('dashboard.doctor.notificationsPage');
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Doctor') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNotifications = () => {
    const token = localStorage.getItem('access_token') || '';
    setLoading(true);
    notificationsApi.list(token, { status: filter === 'all' ? undefined : filter, page })
      .then((data) => { setItems(data.results); setTotalCount(data.count); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (user) fetchNotifications(); }, [user, filter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkRead = async (sid: string) => {
    const token = localStorage.getItem('access_token') || '';
    await notificationsApi.markRead(sid, token).catch(() => {});
    setItems((prev) => prev.map((n) => n.sid === sid ? { ...n, is_read: true } : n));
  };

  const handleMarkAllRead = async () => {
    const token = localStorage.getItem('access_token') || '';
    await notificationsApi.markAllRead(token).catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  /** Runs the actual delete once the ConfirmDialog's confirm button is pressed. */
  const confirmPendingDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const token = localStorage.getItem('access_token') || '';
    try {
      if (pendingDelete === 'all') {
        await notificationsApi.deleteAll(token).catch(() => {});
        setItems([]);
        setTotalCount(0);
      } else {
        const sid = pendingDelete.sid;
        await notificationsApi.delete(sid, token).catch(() => {});
        setItems((prev) => prev.filter((n) => n.sid !== sid));
        setTotalCount((prev) => prev - 1);
      }
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const totalPages = Math.ceil(totalCount / 20);
  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            <Check className="mr-1 h-4 w-4" /> Mark All Read
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setPendingDelete('all')}>
            <Trash2 className="mr-1 h-4 w-4" /> Delete All
          </Button>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => { setFilter(v as FilterStatus); setPage(1); }} className="mb-6">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="read">Read</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        {loading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
        ) : items.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">No notifications</CardContent></Card>
        ) : (
          items.map((n) => (
            <Card key={n.sid} className={!n.is_read ? 'border-l-4 border-l-primary' : ''}>
              <CardContent className="flex items-start justify-between p-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{n.type}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  {!n.is_read && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => handleMarkRead(n.sid)}>
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setPendingDelete({ sid: n.sid })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={pendingDelete === 'all' ? t('confirmDeleteAllTitle') : t('confirmDeleteOneTitle')}
        description={t('confirmDeleteMessage')}
        confirmLabel={t('confirmDeleteButton')}
        cancelLabel={t('confirmCancelButton')}
        variant="destructive"
        onConfirm={confirmPendingDelete}
        loading={deleting}
      />
    </div>
  );
}
