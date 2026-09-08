'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { messaging, ThreadItem } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, Lock } from 'lucide-react';

/** List of the current user's secure-messaging threads (patient or doctor
 * side — identical shape, only `basePath` differs so links land on the
 * right role's route).
 */
export default function ThreadList({ basePath, i18nNamespace }: { basePath: string; i18nNamespace: string }) {
  const t = useTranslations(i18nNamespace);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token') || '';
      const list = await messaging.list(token);
      setThreads(list);
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <MessageCircle className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">{t('empty')}</p>
          <p className="text-xs text-muted-foreground/60">{t('emptyHint')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {threads.map((thread) => (
        <Link key={thread.sid} href={`${basePath}/${thread.sid}`} className="block">
          <Card className="glass-panel transition-shadow hover:shadow-md">
            <CardContent className="flex items-center justify-between gap-3 py-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {thread.other_party_name}
                    {thread.appointment_service_name ? ` - ${thread.appointment_service_name}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(thread.appointment_date).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
                    })}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!thread.is_writable && (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground/50" aria-label={t('closed')} />
                )}
                {thread.unread_count > 0 && (
                  <Badge className="h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px]">
                    {thread.unread_count > 99 ? '99+' : thread.unread_count}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
