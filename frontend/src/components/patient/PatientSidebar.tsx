'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Home, CalendarDays, Bell, DollarSign, User, LogOut, FlaskConical, Heart } from 'lucide-react';

const mainNav = [
  { key: 'dashboard', href: '/dashboard/patient', icon: Home, exact: true },
  { key: 'services', href: '/dashboard/patient/services', icon: FlaskConical },
  { key: 'appointments', href: '/dashboard/patient/appointments', icon: CalendarDays },
];

const activityNav = [
  { key: 'notifications', href: '/dashboard/patient/notifications', icon: Bell },
  { key: 'payments', href: '/dashboard/patient/payments', icon: DollarSign },
];

const accountNav = [
  { key: 'profile', href: '/dashboard/patient/profile', icon: User },
];

export default function PatientSidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  const { logout } = useAuth();

  const renderNavItem = (item: { key: string; href: string; icon: React.ElementType; exact?: boolean }) => {
    const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    const Icon = item.icon;

    return (
      <Link key={item.key} href={item.href}>
        <div className={cn(
          'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}>
          <Icon className={cn('h-5 w-5', isActive ? 'text-primary-foreground' : 'text-muted-foreground')} />
          {t(`dashboard.patient.nav.${item.key}`)}
        </div>
      </Link>
    );
  };

  return (
    <aside className="hidden w-72 shrink-0 border-r bg-card lg:flex lg:flex-col">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <Heart className="h-4.5 w-4.5 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-bold tracking-tight">CHO Health</p>
          <p className="text-[11px] text-muted-foreground">Patient Portal</p>
        </div>
      </div>

      <Separator />

      {/* Main Navigation */}
      <div className="flex-1 px-4 py-4">
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
