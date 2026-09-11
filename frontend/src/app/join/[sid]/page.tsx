'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { appointments as appointmentsApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, Video } from 'lucide-react';

export default function JoinConsultationPage() {
  const params = useParams<{ sid: string }>();
  const router = useRouter();
  const [error, setError] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    appointmentsApi.meetingToken(params.sid, token)
      .then((res) => {
        // Full page navigation, not router.push: the destination is a
        // different origin (the self-hosted Jitsi server).
        window.location.href = res.url;
      })
      .catch((err: unknown) => {
        const apiError = err as { status?: number; data?: { detail?: string; available_from?: string } };
        setAvailableFrom(apiError?.data?.available_from || '');
        setError(apiError?.data?.detail || 'Could not join the consultation.');
      });
  }, [params.sid, router]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card className="glass-panel">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-xl font-bold">Can&apos;t join yet</h1>
            <p className="mt-2 text-muted-foreground">{error}</p>
            {availableFrom && (
              <p className="mt-1 text-sm text-muted-foreground">
                Available from{' '}
                {new Date(availableFrom).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'America/New_York',
                })}
                {' '}(clinic time)
              </p>
            )}
            <Link href="/dashboard" className="mt-6 inline-block"><Button>Back to Dashboard</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <Video className="mx-auto h-8 w-8 text-primary" />
      <Loader2 className="mx-auto mt-4 h-6 w-6 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Joining your consultation...</p>
    </div>
  );
}
