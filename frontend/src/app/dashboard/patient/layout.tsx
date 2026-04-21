'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import PatientSidebar from '@/components/patient/PatientSidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Menu, Home, CalendarDays, Bell, DollarSign, User, LogOut, FlaskConical, Pill, TestTubes, Star } from 'lucide-react';

const navItems = [
  { key: 'dashboard', href: '/dashboard/patient', icon: Home, exact: true },
  { key: 'services', href: '/dashboard/patient/services', icon: FlaskConical },
  { key: 'appointments', href: '/dashboard/patient/appointments', icon: CalendarDays },
  { key: 'medicine', href: '/dashboard/patient/medicine', icon: Pill },
  { key: 'labs', href: '/dashboard/patient/labs', icon: TestTubes },
  { key: 'notifications', href: '/dashboard/patient/notifications', icon: Bell },
  { key: 'reviews', href: '/dashboard/patient/reviews', icon: Star },
  { key: 'payments', href: '/dashboard/patient/payments', icon: DollarSign },
  { key: 'profile', href: '/dashboard/patient/profile', icon: User },
];

export default function PatientDashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations();
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <PatientSidebar />

      {/* Mobile Sheet */}
      <div className="lg:hidden fixed bottom-4 left-4 z-50">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90">
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <nav className="flex flex-col h-full">
              <div className="flex-1 space-y-1 px-3 py-4">
                {navItems.map((item) => {
                  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link key={item.key} href={item.href} onClick={() => setOpen(false)}>
                      <Button variant="ghost" className={cn('w-full justify-start gap-3', isActive && 'bg-primary/10 text-primary')}>
                        <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                        {t(`dashboard.patient.nav.${item.key}`)}
                      </Button>
                    </Link>
                  );
                })}
              </div>
              <Separator />
              <div className="px-3 py-4">
                <Button variant="ghost" className="w-full justify-start gap-3 text-destructive" onClick={() => { logout(); setOpen(false); }}>
                  <LogOut className="h-4 w-4" />
                  {t('common.logout')}
                </Button>
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      <main className="flex-1 overflow-y-auto">
        <CartProvider>{children}</CartProvider>
      </main>
    </div>
  );
}
