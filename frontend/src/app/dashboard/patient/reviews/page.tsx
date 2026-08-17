'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import {
  reviews as reviewsApi,
  ReviewItem,
  PendingReviewAppointment,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, Trash2, Edit3 } from 'lucide-react';
import InitialsAvatar, { resolveImageUrl } from '@/components/InitialsAvatar';
import StarRating from '@/components/StarRating';
import RateDoctorModal from '@/components/RateDoctorModal';
import ConfirmDialog from '@/components/ConfirmDialog';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

type Tab = 'pending' | 'mine' | 'community';

interface RatingTarget {
  appointmentSid: string;
  doctorName: string;
  doctorSpecialization: string | null;
  existingReview: ReviewItem | null;
}

export default function PatientReviewsPage() {
  const t = useTranslations();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending] = useState<PendingReviewAppointment[]>([]);
  const [mine, setMine] = useState<ReviewItem[]>([]);
  const [community, setCommunity] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<RatingTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, authLoading, router]);

  const reload = () => {
    const token = localStorage.getItem('access_token') || '';
    setLoading(true);
    Promise.all([
      reviewsApi.pending(token).catch(() => []),
      reviewsApi.mine(token).catch(() => []),
      reviewsApi.all(token).catch(() => []),
    ])
      .then(([p, m, a]) => {
        setPending(p);
        setMine(m);
        setCommunity(a);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user) reload();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaved = () => {
    setTarget(null);
    reload();
  };

  const openRateForPending = (p: PendingReviewAppointment) => {
    setTarget({
      appointmentSid: p.sid,
      doctorName: p.doctor_name ?? '',
      doctorSpecialization: p.doctor_specialization,
      existingReview: null,
    });
  };

  const openEditMine = (r: ReviewItem) => {
    setTarget({
      appointmentSid: r.appointment_sid,
      doctorName: r.doctor_name,
      doctorSpecialization: r.doctor_specialization,
      existingReview: r,
    });
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const token = localStorage.getItem('access_token') || '';
    try {
      await reviewsApi.delete(confirmDelete, token);
      setMine((prev) => prev.filter((r) => r.sid !== confirmDelete));
      setCommunity((prev) => prev.filter((r) => r.sid !== confirmDelete));
      reload();
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Star className="h-6 w-6 text-amber-400 fill-amber-400" />
        <h2 className="text-2xl font-bold tracking-tight">{t('reviews.pageTitle')}</h2>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-6">
        <TabsList>
          <TabsTrigger value="pending">
            {t('reviews.tabPending')} {pending.length > 0 && `(${pending.length})`}
          </TabsTrigger>
          <TabsTrigger value="mine">{t('reviews.tabMine')}</TabsTrigger>
          <TabsTrigger value="community">{t('reviews.tabCommunity')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : (
        <>
          {tab === 'pending' && (
            <PendingList items={pending} onRate={openRateForPending} t={t} />
          )}
          {tab === 'mine' && (
            <MyReviewsList
              items={mine}
              onEdit={openEditMine}
              onDelete={(sid) => setConfirmDelete(sid)}
              t={t}
            />
          )}
          {tab === 'community' && <CommunityList items={community} t={t} />}
        </>
      )}

      {target && (
        <RateDoctorModal
          isOpen={true}
          onClose={() => setTarget(null)}
          appointmentSid={target.appointmentSid}
          doctorName={target.doctorName}
          doctorSpecialization={target.doctorSpecialization}
          existingReview={target.existingReview}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title={t('reviews.confirmDeleteTitle')}
        description={t('reviews.confirmDeleteDescription')}
        confirmLabel={t('reviews.delete')}
        cancelLabel={t('reviews.cancel')}
        variant="destructive"
        onConfirm={doDelete}
        loading={deleting}
      />
    </div>
  );
}

// ---------- Sub-components ----------

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-16 text-center text-muted-foreground">{message}</CardContent>
    </Card>
  );
}

type TFn = ReturnType<typeof useTranslations>;

function PendingList({
  items, onRate, t,
}: { items: PendingReviewAppointment[]; onRate: (p: PendingReviewAppointment) => void; t: TFn }) {
  if (items.length === 0) return <EmptyState message={t('reviews.emptyPending')} />;
  return (
    <div className="space-y-3">
      {items.map((p) => {
        const img = resolveImageUrl(p.doctor_image, API_BASE);
        return (
          <Card key={p.sid}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <InitialsAvatar src={img} name={p.doctor_name ?? ''} className="h-12 w-12 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold truncate">{p.doctor_name}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {p.doctor_specialization}
                    {p.service_name ? ` · ${p.service_name}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}
                  </p>
                </div>
              </div>
              <Button onClick={() => onRate(p)} size="sm">
                <Star className="mr-1 h-4 w-4" />
                {t('reviews.rate')}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MyReviewsList({
  items, onEdit, onDelete, t,
}: {
  items: ReviewItem[];
  onEdit: (r: ReviewItem) => void;
  onDelete: (sid: string) => void;
  t: TFn;
}) {
  if (items.length === 0) return <EmptyState message={t('reviews.emptyMine')} />;
  return (
    <div className="space-y-3">
      {items.map((r) => (
        <ReviewCard
          key={r.sid}
          review={r}
          showDoctor
          actions={
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(r)}>
                <Edit3 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(r.sid)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          }
        />
      ))}
    </div>
  );
}

function CommunityList({ items, t }: { items: ReviewItem[]; t: TFn }) {
  if (items.length === 0) return <EmptyState message={t('reviews.emptyCommunity')} />;
  return (
    <div className="space-y-3">
      {items.map((r) => <ReviewCard key={r.sid} review={r} showDoctor />)}
    </div>
  );
}

function ReviewCard({
  review, showDoctor, actions,
}: { review: ReviewItem; showDoctor?: boolean; actions?: React.ReactNode }) {
  const patientImg = resolveImageUrl(review.patient_image, API_BASE);
  const doctorImg = resolveImageUrl(review.doctor_image, API_BASE);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <InitialsAvatar src={patientImg} name={review.patient_name} className="h-10 w-10 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{review.patient_name}</p>
                <StarRating value={review.rating} size="sm" />
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}
              </p>
              {review.comment && (
                <p className="mt-2 text-sm whitespace-pre-wrap">{review.comment}</p>
              )}
              {showDoctor && (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                  <InitialsAvatar src={doctorImg} name={review.doctor_name} className="h-7 w-7 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{review.doctor_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{review.doctor_specialization}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          {actions}
        </div>
      </CardContent>
    </Card>
  );
}
