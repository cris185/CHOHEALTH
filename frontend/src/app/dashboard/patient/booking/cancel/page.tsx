'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

export default function BookingCancelPage() {
  // Note: we no longer cancel the appointment here. It stays as 'Unpaid' in the
  // database so the patient can retry payment or delete it from their
  // appointments list. Unpaid appointments don't block time slots.
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card>
        <CardContent className="py-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <XCircle className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="mt-4 text-xl font-bold">Payment Not Completed</h1>
          <p className="mt-2 text-muted-foreground">
            Your appointment is saved as <strong>Unpaid</strong>. You can finish paying anytime or delete it from your appointments list.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/dashboard/patient/appointments"><Button>Go to My Appointments</Button></Link>
            <Link href="/dashboard/patient"><Button variant="outline">Dashboard</Button></Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
