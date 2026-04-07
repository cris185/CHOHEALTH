'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { notifications as notificationsApi, NotificationItem } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Bell } from 'lucide-react';

export default function NotificationBell() {
  const { user } = useAuth();
  const t = useTranslations();
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<NotificationItem[]>([]);

  const dashboardPath = user?.user_type === 'Doctor' ? '/dashboard/doctor' : '/dashboard/patient';

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    const endpoint = user?.user_type === 'Doctor' ? 'notifications' : 'patientNotifications';
    const api = user?.user_type === 'Doctor' ? notificationsApi : notificationsApi;

    api.list(token, { status: 'unread', page: 1 })
      .then((data) => {
        setUnreadCount(data.count);
        setRecent(data.results.slice(0, 5));
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full p-0 text-[10px]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <div className="px-3 py-2">
          <p className="text-sm font-semibold">{t('dashboard.doctor.notifications')}</p>
        </div>
        <DropdownMenuSeparator />

        {recent.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications</div>
        ) : (
          recent.map((n) => (
            <DropdownMenuItem key={n.sid} className="flex flex-col items-start gap-1 px-3 py-2.5 cursor-pointer">
              <div className="flex items-center gap-2 w-full">
                {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                <span className="text-sm font-medium">{n.type}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1 pl-4">{n.message}</p>
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />
        <div className="p-2">
          <Link href={`${dashboardPath}/notifications`} className="block text-center text-sm font-medium text-primary hover:underline">
            View All
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
