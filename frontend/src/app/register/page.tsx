'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { User, Stethoscope } from 'lucide-react';
import Image from 'next/image';

export default function RegisterPage() {
  const t = useTranslations();

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Image src="/logo.png" alt="CHO Health" width={220} height={80} className="h-20 w-auto" />
          <h1 className="text-2xl font-bold tracking-tight">{t('common.appName')}</h1>
          <p className="text-sm text-muted-foreground">{t('register.selectTitle')}</p>
        </div>

        <div className="space-y-3">
          <Link href="/register/patient">
            <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                  <User className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="font-semibold">{t('register.patient.title')}</h2>
                  <p className="text-sm text-muted-foreground">{t('register.patient.subtitle')}</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/register/doctor">
            <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 mt-3">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                  <Stethoscope className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <h2 className="font-semibold">{t('register.doctor.title')}</h2>
                  <p className="text-sm text-muted-foreground">{t('register.doctor.subtitle')}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {t('register.hasAccount')}{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t('register.login')}
          </Link>
        </p>
      </div>
    </div>
  );
}
