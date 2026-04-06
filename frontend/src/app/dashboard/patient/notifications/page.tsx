'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { patientNotifications as notificationsApi, NotificationItem } from '@/lib/api';

type FilterStatus = 'all' | 'unread' | 'read';

export default function PatientNotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    if (!authLoading && user && user.user_type !== 'Patient') router.push('/dashboard');
  }, [user, authLoading, router]);

  const fetchNotifications = () => {
    const token = localStorage.getItem('access_token') || '';
    setLoading(true);
    notificationsApi.list(token, { status: filter === 'all' ? undefined : filter, page })
      .then((data) => {
        setItems(data.results);
        setTotalCount(data.count);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user) fetchNotifications();
  }, [user, filter, page]);

  const handleMarkRead = async (sid: string) => {
    const token = localStorage.getItem('access_token') || '';
    await notificationsApi.markRead(sid, token).catch(() => {});
    setItems((prev) => prev.map((n) => n.sid === sid ? { ...n, is_read: true } : n));
  };

  const handleDelete = async (sid: string) => {
    const token = localStorage.getItem('access_token') || '';
    await notificationsApi.delete(sid, token).catch(() => {});
    setItems((prev) => prev.filter((n) => n.sid !== sid));
    setTotalCount((prev) => prev - 1);
  };

  const handleMarkAllRead = async () => {
    const token = localStorage.getItem('access_token') || '';
    await notificationsApi.markAllRead(token).catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to delete all notifications?')) return;
    const token = localStorage.getItem('access_token') || '';
    await notificationsApi.deleteAll(token).catch(() => {});
    setItems([]);
    setTotalCount(0);
  };

  const totalPages = Math.ceil(totalCount / 20);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
        <div className="flex gap-2">
          <button onClick={handleMarkAllRead}
            className="rounded-md bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200">
            Mark All as Read
          </button>
          <button onClick={handleDeleteAll}
            className="rounded-md bg-red-100 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-200">
            Delete All
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
        {(['all', 'unread', 'read'] as FilterStatus[]).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              filter === f ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Read'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <p className="text-gray-400">{t('common.loading')}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <p className="text-gray-400">No notifications</p>
          </div>
        ) : (
          items.map((n) => (
            <div key={n.sid}
              className={`flex items-start justify-between rounded-lg bg-white p-4 shadow ${!n.is_read ? 'border-l-4 border-blue-500' : ''}`}>
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{n.type}</p>
                  <p className="mt-1 text-sm text-gray-600">{n.message}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(n.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {!n.is_read && (
                  <button onClick={() => handleMarkRead(n.sid)} className="rounded p-1 text-blue-500 hover:bg-blue-50">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                )}
                <button onClick={() => handleDelete(n.sid)} className="rounded p-1 text-red-400 hover:bg-red-50">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">Previous</button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
