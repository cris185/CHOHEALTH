'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { messaging, ThreadItem, ThreadMessageItem, ThreadAttachment, downloadPdf } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import ConfirmDialog from '@/components/ConfirmDialog';
import { ArrowLeft, Send, Lock, Paperclip, FileText, X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 15000;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

interface ApiError {
  status?: number;
  data?: { detail?: string; code?: string };
}

function AttachmentBubble({ attachment, isMine }: { attachment: ThreadAttachment; isMine: boolean }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const isImage = attachment.content_type.startsWith('image/');

  useEffect(() => {
    if (!isImage) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    const token = localStorage.getItem('access_token') || '';
    messaging.attachmentBlob(attachment.download_url, token)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImgUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment, isImage]);

  const handleDownload = async () => {
    const token = localStorage.getItem('access_token') || '';
    try {
      await downloadPdf(attachment.download_url, attachment.filename, token);
    } catch {
      toast.error('Could not download the file.');
    }
  };

  if (isImage) {
    return imgUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imgUrl}
        alt={attachment.filename}
        onClick={handleDownload}
        className="mt-2 max-h-64 cursor-pointer rounded-lg object-contain"
      />
    ) : (
      <Skeleton className="mt-2 h-32 w-48 rounded-lg" />
    );
  }

  return (
    <button
      onClick={handleDownload}
      className={cn(
        'mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs hover:opacity-80',
        isMine ? 'border-primary-foreground/30' : 'border-border',
      )}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate">{attachment.filename}</span>
    </button>
  );
}

export default function ThreadView({ threadSid, basePath, i18nNamespace }: {
  threadSid: string;
  basePath: string;
  i18nNamespace: string;
}) {
  const t = useTranslations(i18nNamespace);
  const router = useRouter();

  const [thread, setThread] = useState<ThreadItem | null>(null);
  const [msgs, setMsgs] = useState<ThreadMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      const token = localStorage.getItem('access_token') || '';
      const res = await messaging.messages(threadSid, token);
      setThread(res.thread);
      setMsgs(res.messages);
      setUnavailable(false);
    } catch (err: unknown) {
      const apiError = err as ApiError;
      if (apiError.status === 503) {
        setUnavailable(true);
      } else if (!opts?.silent) {
        toast.error(t('loadError'));
      }
    } finally {
      setLoading(false);
    }
  }, [threadSid, t]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => load({ silent: true }), POLL_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  const handleSend = async () => {
    const content = draft.trim();
    if (sending) return;
    if (!content && !pendingFile) return;

    setSending(true);
    try {
      const token = localStorage.getItem('access_token') || '';
      const sent = pendingFile
        ? await messaging.uploadAttachment(threadSid, pendingFile, content, token)
        : await messaging.send(threadSid, content, token);
      setMsgs((prev) => [...prev, sent]);
      setDraft('');
      setPendingFile(null);
      if (thread) setThread({ ...thread, message_count: thread.message_count + 1 });
    } catch (err: unknown) {
      const apiError = err as ApiError;
      if (apiError.status === 503) {
        toast.error(t('sendUnavailable'));
      } else {
        toast.error(apiError.data?.detail || t('sendError'));
      }
    } finally {
      setSending(false);
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
      toast.error(t('attachmentTypeError'));
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(t('attachmentSizeError'));
      return;
    }
    setPendingFile(file);
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      const token = localStorage.getItem('access_token') || '';
      const updated = await messaging.close(threadSid, token);
      setThread(updated);
      setCloseDialogOpen(false);
      toast.success(t('closeSuccess'));
    } catch {
      toast.error(t('closeError'));
    } finally {
      setClosing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (unavailable && !thread) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">{t('loadError')}</p>
        </CardContent>
      </Card>
    );
  }

  if (!thread) return null;

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(basePath)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold tracking-tight">{thread.other_party_name}</h1>
            <p className="text-xs text-muted-foreground">
              {thread.appointment_service_name ? `${thread.appointment_service_name} · ` : ''}
              {new Date(thread.appointment_date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
              })}
            </p>
            {!thread.is_writable && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" /> {t('closed')}
              </p>
            )}
          </div>
        </div>
        {thread.my_role === 'doctor' && thread.is_writable && (
          <Button variant="outline" size="sm" onClick={() => setCloseDialogOpen(true)}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" /> {t('closeButton')}
          </Button>
        )}
      </div>

      <Card className="glass-panel flex flex-1 flex-col overflow-hidden">
        <CardContent className="flex-1 space-y-3 overflow-y-auto py-4">
          {msgs.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t('noMessagesYet')}</p>
          ) : (
            msgs.map((m) => (
              <div key={m.sid} className={cn('flex', m.is_mine ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm',
                  m.is_mine
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm bg-muted text-foreground',
                )}>
                  {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                  {m.attachment && <AttachmentBubble attachment={m.attachment} isMine={m.is_mine} />}
                  <p className={cn(
                    'mt-1 text-[10px]',
                    m.is_mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
                  )}>
                    {new Date(m.sent_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </CardContent>

        <div className="border-t p-3">
          {thread.is_writable ? (
            <div className="space-y-2">
              {pendingFile && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 text-xs">
                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{pendingFile.name}</span>
                  <button onClick={() => setPendingFile(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_ATTACHMENT_TYPES.join(',')}
                  className="hidden"
                  onChange={handleFilePick}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('composerPlaceholder')}
                  disabled={sending}
                  className="min-h-10 resize-none"
                  rows={1}
                />
                <Button onClick={handleSend} disabled={sending || (!draft.trim() && !pendingFile)} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground">{t('closedHint')}</p>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        title={t('closeConfirmTitle')}
        description={t('closeConfirmDescription')}
        confirmLabel={t('closeButton')}
        cancelLabel={t('cancel')}
        variant="default"
        onConfirm={handleClose}
        loading={closing}
      />
    </div>
  );
}
