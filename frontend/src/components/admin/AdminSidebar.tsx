'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Users, Truck, LogOut } from 'lucide-react';

const mainNav = [
  { key: 'users', href: '/dashboard/admin', icon: Users, exact: true },
  { key: 'deliveries', href: '/dashboard/admin/deliveries', icon: Truck },
];

export default function AdminSidebar() {
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
            ? 'bg-primary/15 text-primary font-semibold'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}>
          <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
          <span className="flex-1">{t(`dashboard.admin.nav.${item.key}`)}</span>
        </div>
      </Link>
    );
  };

  return (
    <aside className="glass-panel hidden w-72 shrink-0 lg:flex lg:flex-col sticky top-16 h-[calc(100vh-4rem)]">
      <div className="flex h-24 items-center justify-center px-5">
        <Image src="/logo.png" alt="CHO Health" width={480} height={160} className="h-20 w-auto" priority />
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Main</p>
        <nav className="space-y-1">
          {mainNav.map(renderNavItem)}
        </nav>
      </div>

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
