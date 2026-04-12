'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useTranslations } from 'next-intl';

interface OrderPickupCodeProps {
  code: string;
  /** Compact mode hides the hint text. */
  compact?: boolean;
}

/**
 * Renders a pickup code with a QR (generated client-side from the code text).
 * Used in the "My Orders" tab and in the payment success page.
 */
export default function OrderPickupCode({ code, compact }: OrderPickupCodeProps) {
  const t = useTranslations('dashboard.patient.medicinePage');

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        {t('pickupCodeLabel')}
      </p>
      <p className="font-mono text-xl font-bold tracking-[3px] text-gray-900">{code}</p>
      <QRCodeSVG value={code} size={compact ? 120 : 160} />
      {!compact && (
        <p className="text-center text-xs text-gray-400">{t('pickupCodeHint')}</p>
      )}
    </div>
  );
}
