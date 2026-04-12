'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

/**
 * Landing page when the user cancels the medicine order payment at Stripe/PayPal.
 * The order stays in 'Pending Payment' and can be paid later from the
 * "My orders" tab in `/dashboard/patient/medicine`.
 */
export default function MedicinePaymentCancelPage() {
  const t = useTranslations('dashboard.patient.medicinePaymentPages');
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card>
        <CardContent className="py-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <XCircle className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="mt-4 text-xl font-bold">{t('cancelTitle')}</h1>
          <p className="mt-2 text-muted-foreground">{t('cancelMessage')}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/dashboard/patient/medicine">
              <Button>{t('backToMedicine')}</Button>
            </Link>
            <Link href="/dashboard/patient">
              <Button variant="outline">{t('dashboard')}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
