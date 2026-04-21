'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Home, CalendarDays, Bell, DollarSign, User, LogOut, FlaskConical, Pill, TestTubes, Truck, Star } from 'lucide-react';
import { reviews as reviewsApi } from '@/lib/api';

const mainNav = [
  { key: 'dashboard', href: '/dashboard/patient', icon: Home, exact: true },
  { key: 'services', href: '/dashboard/patient/services', icon: FlaskConical },
  { key: 'appointments', href: '/dashboard/patient/appointments', icon: CalendarDays },
];

const healthNav = [
  { key: 'medicine', href: '/dashboard/patient/medicine', icon: Pill },
  { key: 'labs', href: '/dashboard/patient/labs', icon: TestTubes },
  { key: 'deliveries', href: '/dashboard/patient/deliveries', icon: Truck },
];

const activityNav = [
  { key: 'notifications', href: '/dashboard/patient/notifications', icon: Bell },
  { key: 'reviews', href: '/dashboard/patient/reviews', icon: Star },
  { key: 'payments', href: '/dashboard/patient/payments', icon: DollarSign },
];

const accountNav = [
  { key: 'profile', href: '/dashboard/patient/profile', icon: User },
];

export default function PatientSidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  const { logout } = useAuth();
  const [pendingReviews, setPendingReviews] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    reviewsApi.pending(token)
      .then((data) => setPendingReviews(data.length))
      .catch(() => {});
  }, [pathname]);

  const renderNavItem = (item: { key: string; href: string; icon: React.ElementType; exact?: boolean }) => {
    const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    const Icon = item.icon;
    const hasPendingReviews = item.key === 'reviews' && pendingReviews > 0;

    return (
      <Link key={item.key} href={item.href}>
        <div className={cn(
          'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-primary text-primary-foreground shadow-sm'
            : hasPendingReviews
              ? 'bg-amber-50 text-amber-900 hover:bg-amber-100'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}>
          <Icon className={cn(
            'h-5 w-5',
            isActive
              ? 'text-primary-foreground'
              : hasPendingReviews
                ? 'text-amber-500 fill-amber-400 animate-pulse'
                : 'text-muted-foreground'
          )} />
          <span className="flex-1">{t(`dashboard.patient.nav.${item.key}`)}</span>
          {hasPendingReviews && (
            <span className={cn(
              'flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
              isActive ? 'bg-white text-primary' : 'bg-amber-500 text-white animate-pulse'
            )}>
              {pendingReviews}
            </span>
          )}
        </div>
      </Link>
    );
  };

  return (
    <aside className="hidden w-72 shrink-0 border-r bg-card lg:flex lg:flex-col sticky top-16 h-[calc(100vh-4rem)]">
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

        <p className="mb-2 mt-6 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Health</p>
        <nav className="space-y-1">
          {healthNav.map(renderNavItem)}
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
