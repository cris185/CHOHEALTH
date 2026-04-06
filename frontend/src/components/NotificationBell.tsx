'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { notifications as notificationsApi, NotificationItem } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function NotificationBell() {
  const { user } = useAuth();
  const t = useTranslations();
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const dashboardPath = user?.user_type === 'Doctor' ? '/dashboard/doctor' : '/dashboard/patient';

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    notificationsApi.list(token, { status: 'unread', page: 1 })
      .then((data) => {
        setUnreadCount(data.count);
        setRecent(data.results.slice(0, 5));
      })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMarkRead = async (sid: string) => {
    const token = localStorage.getItem('access_token') || '';
    await notificationsApi.markRead(sid, token).catch(() => {});
    setRecent((prev) => prev.map((n) => n.sid === sid ? { ...n, is_read: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg bg-white shadow-lg ring-1 ring-black/5 z-50">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.doctor.notifications')}</h3>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {recent.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No notifications</p>
            ) : (
              recent.map((n) => (
                <div
                  key={n.sid}
                  className={`border-b px-4 py-3 text-sm cursor-pointer hover:bg-gray-50 ${!n.is_read ? 'bg-blue-50' : ''}`}
                  onClick={() => !n.is_read && handleMarkRead(n.sid)}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">{n.type}</p>
                      <p className="truncate text-gray-500">{n.message}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t px-4 py-2">
            <Link
              href={`${dashboardPath}/notifications`}
              className="block text-center text-sm font-medium text-blue-600 hover:text-blue-500"
              onClick={() => setOpen(false)}
            >
              View All
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
