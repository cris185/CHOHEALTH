'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import NotificationBell from './NotificationBell';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, LogOut, User as UserIcon } from 'lucide-react';

const authPaths = ['/login', '/register', '/home'];

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard/patient': 'dashboard.patient.nav.dashboard',
  '/dashboard/patient/services': 'dashboard.patient.nav.services',
  '/dashboard/patient/appointments': 'dashboard.patient.nav.appointments',
  '/dashboard/patient/medicine': 'dashboard.patient.nav.medicine',
  '/dashboard/patient/labs': 'dashboard.patient.nav.labs',
  '/dashboard/patient/deliveries': 'dashboard.patient.nav.deliveries',
  '/dashboard/patient/notifications': 'dashboard.patient.nav.notifications',
  '/dashboard/patient/payments': 'dashboard.patient.nav.payments',
  '/dashboard/patient/profile': 'dashboard.patient.nav.profile',
  '/dashboard/doctor': 'dashboard.doctor.nav.dashboard',
  '/dashboard/doctor/appointments': 'dashboard.doctor.nav.appointments',
  '/dashboard/doctor/notifications': 'dashboard.doctor.nav.notifications',
  '/dashboard/doctor/payments': 'dashboard.doctor.nav.payments',
  '/dashboard/doctor/profile': 'dashboard.doctor.nav.profile',
};

function getTitleKey(pathname: string): string | null {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  const match = Object.keys(ROUTE_TITLES)
    .sort((a, b) => b.length - a.length)
    .find((route) => pathname.startsWith(route + '/') || pathname === route);
  return match ? ROUTE_TITLES[match] : null;
}

function getInitials(email: string): string {
  const name = email.split('@')[0];
  return name.slice(0, 2).toUpperCase();
}

export default function Header() {
  const { user, logout } = useAuth();
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = authPaths.some((p) => pathname.startsWith(p));

  const titleKey = getTitleKey(pathname);
  const profileHref = user?.user_type === 'Doctor' ? '/dashboard/doctor/profile' : '/dashboard/patient/profile';
  const isDashboard = Boolean(user) && pathname.startsWith('/dashboard');

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="flex h-16 items-center">
        {/* Left: Section title — aligned with sidebar logo when in dashboard */}
        {isDashboard ? (
          <div className="flex items-center pl-6 flex-1 lg:pl-0 lg:w-72 lg:flex-none lg:justify-center lg:shrink-0">
            {user && titleKey && (
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{t(titleKey)}</h1>
            )}
          </div>
        ) : (
          <div className="flex items-center pl-6 flex-1">
            <Link href="/home" className="text-xl font-bold tracking-tight text-foreground">
              CHO Health
            </Link>
          </div>
        )}

        {/* Right: actions + user */}
        <div className={`flex items-center gap-3 pr-6 ${isDashboard ? 'lg:flex-1 lg:justify-end' : ''}`}>
          {user && (
            <>
              <NotificationBell />
              <Separator orientation="vertical" className="h-6" />
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring">
                  <Avatar>
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {getInitials(user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium md:inline">
                    {user.email.split('@')[0]}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="flex flex-col px-2 py-1.5">
                    <span className="text-sm font-medium">{user.email.split('@')[0]}</span>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push(profileHref)}>
                    <UserIcon className="mr-2 h-4 w-4" />
                    {t(`dashboard.${user.user_type.toLowerCase()}.nav.profile`)}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('common.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          {!user && !isAuthPage && (
            <Link href="/login">
              <Button size="sm">{t('login.submit')}</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
