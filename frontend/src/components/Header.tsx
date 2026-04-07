'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import NotificationBell from './NotificationBell';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Heart, LogOut } from 'lucide-react';

const authPaths = ['/login', '/register', '/home'];

export default function Header() {
  const { user, logout } = useAuth();
  const t = useTranslations();
  const pathname = usePathname();
  const isAuthPage = authPaths.some((p) => pathname.startsWith(p));

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/home" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Heart className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">{t('common.appName')}</span>
        </Link>

        <div className="flex items-center gap-3">
          {user && (
            <>
              <NotificationBell />
              <Separator orientation="vertical" className="h-6" />
              {user.user_type === 'Doctor' && (
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  {t('dashboard.doctor.badge')}
                </Badge>
              )}
              {user.user_type === 'Patient' && (
                <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                  {t('dashboard.patient.badge')}
                </Badge>
              )}
              <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
              <Button variant="ghost" size="sm" onClick={logout} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">{t('common.logout')}</span>
              </Button>
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
