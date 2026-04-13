'use client';

import { useState } from 'react';
import { Copy, Check, FlaskConical } from 'lucide-react';

/**
 * Small helper surfaced inside `PaymentModal` whenever the app is running
 * against Stripe test mode. Shows the canonical test card numbers with
 * one-click copy buttons so demo reviewers (and us while testing) don't
 * have to type them into the Stripe Checkout page by hand.
 *
 * Stripe's hosted Checkout page (checkout.stripe.com) cannot be programmatically
 * autofilled — that's a PCI compliance hard limit. Showing the card here and
 * letting the user paste it on the Stripe side is the portfolio-grade way.
 *
 * The component only renders when `NEXT_PUBLIC_STRIPE_TEST_MODE` is set to
 * `'true'` (or when missing and we're in a non-production build). That way the
 * helper disappears from real prod deploys without any extra wiring.
 */

const TEST_CARD_NUMBER = '4242 4242 4242 4242';
const TEST_CARD_EXPIRY = '12 / 34';
const TEST_CARD_CVC = '123';
const TEST_CARD_ZIP = '42424';

function shouldShowHelper(): boolean {
  // Explicit opt-in/out via env var.
  const flag = process.env.NEXT_PUBLIC_STRIPE_TEST_MODE;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  // Default: show in non-production builds (dev + preview). Never in prod.
  return process.env.NODE_ENV !== 'production';
}

interface CopyFieldProps {
  label: string;
  value: string;
}

function CopyField({ label, value }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // navigator.clipboard is unavailable in insecure contexts — silently ignore.
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-indigo-500">
        {label}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="mt-0.5 flex items-center gap-1.5 rounded text-left font-mono text-xs font-medium text-indigo-900 transition-colors hover:text-indigo-700"
        aria-label={`Copy ${label}`}
      >
        <span>{value}</span>
        {copied ? (
          <Check className="h-3 w-3 text-emerald-600" />
        ) : (
          <Copy className="h-3 w-3 opacity-60" />
        )}
      </button>
    </div>
  );
}

export default function StripeTestCardHelper() {
  if (!shouldShowHelper()) return null;

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
      <div className="flex items-center gap-1.5">
        <FlaskConical className="h-3.5 w-3.5 text-indigo-500" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600">
          Demo test card
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-indigo-700/80">
        This app uses Stripe in test mode. Click any field to copy, then paste
        it into the Stripe payment page.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-3">
        <CopyField label="Card number" value={TEST_CARD_NUMBER} />
        <CopyField label="Expiry" value={TEST_CARD_EXPIRY} />
        <CopyField label="CVC" value={TEST_CARD_CVC} />
        <CopyField label="ZIP" value={TEST_CARD_ZIP} />
      </div>
    </div>
  );
}
