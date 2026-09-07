'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Home, CalendarDays, Bell, DollarSign, User, LogOut, MessageCircle } from 'lucide-react';
import { messaging as messagingApi } from '@/lib/api';

const mainNav = [
  { key: 'dashboard', href: '/dashboard/doctor', icon: Home, exact: true },
  { key: 'appointments', href: '/dashboard/doctor/appointments', icon: CalendarDays },
];

const activityNav = [
  { key: 'messages', href: '/dashboard/doctor/messages', icon: MessageCircle },
  { key: 'notifications', href: '/dashboard/doctor/notifications', icon: Bell },
  { key: 'payments', href: '/dashboard/doctor/payments', icon: DollarSign },
];

const accountNav = [
  { key: 'profile', href: '/dashboard/doctor/profile', icon: User },
];

export default function DoctorSidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  const { logout } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    const poll = () => messagingApi.unreadCount(token).then((d) => setUnreadMessages(d.unread_count)).catch(() => {});
    poll();
    const timer = setInterval(poll, 60000);
    return () => clearInterval(timer);
  }, [pathname]);

  const renderNavItem = (item: { key: string; href: string; icon: React.ElementType; exact?: boolean }) => {
    const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    const Icon = item.icon;
    const unreadCount = item.key === 'messages' ? unreadMessages : 0;

    return (
      <Link key={item.key} href={item.href}>
        <div className={cn(
          'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-primary/15 text-primary font-semibold'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}>
          <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
          <span className="flex-1">{t(`dashboard.doctor.nav.${item.key}`)}</span>
          {unreadCount > 0 && (
            <span className={cn(
              'flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
              isActive ? 'bg-white text-primary' : 'bg-primary text-primary-foreground'
            )}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </Link>
    );
  };

  return (
    <aside className="glass-panel hidden w-72 shrink-0 lg:flex lg:flex-col sticky top-16 h-[calc(100vh-4rem)]">
      {/* Brand */}
      <div className="flex h-24 items-center justify-center px-5">
        <Image src="/logo.png" alt="CHO Health" width={480} height={160} className="h-20 w-auto" priority />
      </div>

      <Separator />

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Main</p>
        <nav className="space-y-1">
          {mainNav.map(renderNavItem)}
        </nav>

        <p className="mb-2 mt-6 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Activity</p>
        <nav className="space-y-1">
          {activityNav.map(renderNavItem)}
        </nav>

        <p className="mb-2 mt-6 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Account</p>
        <nav className="space-y-1">
          {accountNav.map(renderNavItem)}
        </nav>
      </div>

      {/* Logout */}
      <Separator />
      <div className="px-4 py-4">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 transition-all duration-200"
        >
          <LogOut className="h-5 w-5" />
          {t('common.logout')}
        </button>
      </div>
    </aside>
  );
}
