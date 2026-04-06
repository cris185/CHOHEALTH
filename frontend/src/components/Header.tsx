'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
// import LanguageSwitcher from './LanguageSwitcher';
import NotificationBell from './NotificationBell';
import Link from 'next/link';

const authPaths = ['/login', '/register', '/home'];

export default function Header() {
  const { user, logout } = useAuth();
  const t = useTranslations();
  const pathname = usePathname();
  const isAuthPage = authPaths.some((p) => pathname.startsWith(p));

  return (
    <nav className="bg-white shadow">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <Link href="/dashboard" className="text-xl font-bold text-blue-600">
          {t('common.appName')}
        </Link>

        <div className="flex items-center gap-4">
          {/* <LanguageSwitcher /> */}
          {user && (
            <>
              <NotificationBell />
              {user.user_type === 'Doctor' && (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                  {t('dashboard.doctor.badge')}
                </span>
              )}
              {user.user_type === 'Patient' && (
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                  {t('dashboard.patient.badge')}
                </span>
              )}
              <span className="text-sm text-gray-600">{user.email}</span>
              <button onClick={logout}
                className="rounded-md bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600">
                {t('common.logout')}
              </button>
            </>
          )}
          {!user && !isAuthPage && (
            <Link href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500">
              {t('login.submit')}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}