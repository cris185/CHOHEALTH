'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { appointments as appointmentsApi, DoctorAppointmentDetail } from '@/lib/api';
import CancelAppointmentModal from './CancelAppointmentModal';
import RescheduleModal from './RescheduleModal';
import ConsultationCloseModal from './ConsultationCloseModal';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  // first_name [second_name] first_last_name [second_last_name]
  const firstInitial = parts[0][0];
  const lastInitial = parts.length >= 3 ? parts[2][0] : parts[1][0];
  return (firstInitial + lastInitial).toUpperCase();
}

function PatientAvatar({ src, name, size = 'lg' }: { src: string | null; name: string; size?: 'sm' | 'lg' }) {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(name);
  const sizeClass = size === 'lg' ? 'h-16 w-16' : 'h-6 w-6';
  const textClass = size === 'lg' ? 'text-lg' : 'text-[9px]';

  if (src && !imgError) {
    return <img src={src} alt={name} className={`${sizeClass} rounded-full object-cover`} onError={() => setImgError(true)} />;
  }
  return (
    <div className={`flex ${sizeClass} items-center justify-center rounded-full bg-blue-100`}>
      <span className={`${textClass} font-bold text-blue-600`}>{initials}</span>
    </div>
  );
}

interface AppointmentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentSid: string | null;
  onAppointmentChanged?: () => void;
}

export default function AppointmentDetailModal({ isOpen, onClose, appointmentSid, onAppointmentChanged }: AppointmentDetailModalProps) {
  const t = useTranslations();
  const tActions = useTranslations('dashboard.doctor.appointmentsPage');
  const [detail, setDetail] = useState<DoctorAppointmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [startVirtualOpen, setStartVirtualOpen] = useState(false);
  const [meetingLink, setMeetingLink] = useState('');
  const [meetingProvider, setMeetingProvider] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const refetchDetail = () => {
    if (!appointmentSid) return;
    const token = localStorage.getItem('access_token') || '';
    appointmentsApi.doctorDetail(appointmentSid, token)
      .then(setDetail)
      .catch(() => {});
  };

  useEffect(() => {
    if (isOpen && appointmentSid) {
      setLoading(true);
      setActionError('');
      const token = localStorage.getItem('access_token') || '';
      appointmentsApi.doctorDetail(appointmentSid, token)
        .then(setDetail)
        .catch(() => setDetail(null))
        .finally(() => setLoading(false));
    }
  }, [isOpen, appointmentSid]);

  const handleDoctorCancel = async (sid: string, reason: string) => {
    const token = localStorage.getItem('access_token') || '';
    await appointmentsApi.doctorCancel(sid, reason, token);
    onAppointmentChanged?.();
    onClose();
  };

  const handleDoctorReschedule = async (sid: string, dateTimeIso: string) => {
    const token = localStorage.getItem('access_token') || '';
    await appointmentsApi.doctorReschedule(sid, dateTimeIso, token);
    onAppointmentChanged?.();
    // Refetch the detail so the modal shows the new date if the user keeps it open
    refetchDetail();
  };

  const changeStatus = async (
    newStatus: 'In Progress' | 'No Show',
    extra?: { meeting_link?: string; meeting_provider?: string },
  ) => {
    if (!detail) return;
    setActionError('');
    setActionBusy(true);
    try {
      const token = localStorage.getItem('access_token') || '';
      await appointmentsApi.doctorStatus(detail.sid, newStatus, token, extra);
      onAppointmentChanged?.();
      // Keep the modal open so the doctor sees the new state and can keep working.
      refetchDetail();
      return true;
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string; meeting_link?: string[] } };
      const linkErr = apiError?.data?.meeting_link?.[0];
      setActionError(linkErr || apiError?.data?.detail || tActions('statusChangeFailed'));
      return false;
    } finally {
      setActionBusy(false);
    }
  };

  const handleStartConsultation = () => {
    if (!detail) return;
    if (detail.mode === 'Virtual') {
      setMeetingLink('');
      setMeetingProvider('');
      setActionError('');
      setStartVirtualOpen(true);
    } else {
      changeStatus('In Progress');
    }
  };

  const handleConfirmStartVirtual = async () => {
    if (!meetingLink.trim()) {
      setActionError(tActions('meetingLinkRequired'));
      return;
    }
    const ok = await changeStatus('In Progress', {
      meeting_link: meetingLink.trim(),
      meeting_provider: meetingProvider.trim(),
    });
    if (ok) setStartVirtualOpen(false);
  };

  const handleCompleted = () => {
    onAppointmentChanged?.();
    refetchDetail();
    // Leave the modal open so the doctor can see the refreshed "Completed" state.
  };

  const now = new Date();
  const scheduled = detail ? new Date(detail.date) : null;
  const canModify = detail && detail.status === 'Confirmed' && scheduled! > now;
  const canStart = detail && detail.status === 'Confirmed';
  const canComplete = detail && detail.status === 'In Progress';
  // Only allow "No Show" once the scheduled time has clearly passed (15-minute grace).
  const canMarkNoShow =
    detail &&
    detail.status === 'Confirmed' &&
    scheduled! < new Date(now.getTime() - 15 * 60 * 1000);

  if (!isOpen) return null;

  const patientImage = detail?.patient_image
    ? detail.patient_image.startsWith('http') ? detail.patient_image : `${API_BASE}${detail.patient_image}`
    : null;

  const statusColors: Record<string, string> = {
    Unpaid: 'bg-amber-100 text-amber-700',
    Confirmed: 'bg-green-100 text-green-700',
    'In Progress': 'bg-blue-100 text-blue-700',
    Completed: 'bg-gray-100 text-gray-600',
    Cancelled: 'bg-red-100 text-red-700',
    'No Show': 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-bold text-gray-900">Appointment Details</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">{t('common.loading')}</div>
        ) : detail ? (
          <div className="p-4 space-y-4">
            {/* Patient info */}
            <div className="flex items-center gap-4">
              <PatientAvatar src={patientImage} name={detail.patient_name} size="lg" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{detail.patient_name}</h3>
                <p className="text-sm text-gray-500">{detail.patient_email}</p>
                {detail.patient_phone && <p className="text-sm text-gray-500">{detail.patient_phone}</p>}
              </div>
            </div>

            {/* Patient details */}
            <div className="grid grid-cols-3 gap-3 rounded-lg bg-gray-50 p-3 text-sm">
              {detail.patient_date_of_birth && (
                <div>
                  <span className="text-gray-500">Date of Birth</span>
                  <p className="font-medium text-gray-900">{detail.patient_date_of_birth}</p>
                </div>
              )}
              {detail.patient_gender && (
                <div>
                  <span className="text-gray-500">Gender</span>
                  <p className="font-medium text-gray-900">{detail.patient_gender}</p>
                </div>
              )}
              {detail.patient_blood_group && (
                <div>
                  <span className="text-gray-500">Blood Type</span>
                  <p className="font-medium text-gray-900">{detail.patient_blood_group}</p>
                </div>
              )}
            </div>

            {/* Appointment info */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColors[detail.status] || ''}`}>
                  {detail.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Date & Time</span>
                <span className="font-medium text-gray-900">
                  {new Date(detail.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Mode</span>
                <span className="font-medium text-gray-900">{detail.mode}</span>
              </div>
              {detail.service_name && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Service</span>
                  <span className="font-medium text-gray-900">{detail.service_name} ({detail.service_duration} min)</span>
                </div>
              )}
              {detail.branch_name && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Branch</span>
                  <span className="font-medium text-gray-900">{detail.branch_name}</span>
                </div>
              )}
              {detail.room && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Room</span>
                  <span className="font-medium text-gray-900">{detail.room}</span>
                </div>
              )}
            </div>

            {detail.mode === 'Virtual' && detail.meeting_link && (
              <a
                href={detail.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-3 transition hover:bg-blue-100"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                    {tActions('virtualMeetingLink')}
                  </p>
                  <p className="truncate text-xs text-blue-700">{detail.meeting_link}</p>
                </div>
                <span className="ml-3 shrink-0 rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                  {tActions('join')}
                </span>
              </a>
            )}

            {/* Issues / Symptoms / Notes */}
            {(detail.issues || detail.symptoms || detail.notes) && (
              <div className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
                {detail.issues && (
                  <div>
                    <span className="font-medium text-gray-700">Reason for visit:</span>
                    <p className="text-gray-600">{detail.issues}</p>
                  </div>
                )}
                {detail.symptoms && (
                  <div>
                    <span className="font-medium text-gray-700">Symptoms:</span>
                    <p className="text-gray-600">{detail.symptoms}</p>
                  </div>
                )}
                {detail.notes && (
                  <div>
                    <span className="font-medium text-gray-700">Notes:</span>
                    <p className="text-gray-600">{detail.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">Appointment not found</div>
        )}

        <div className="border-t p-4 space-y-2">
          {actionError && <p className="text-xs text-red-600">{actionError}</p>}

          {/* Status-driven primary actions */}
          {canStart && (
            <button
              onClick={handleStartConsultation}
              disabled={actionBusy}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tActions('startConsultation')}
            </button>
          )}

          {canComplete && (
            <button
              onClick={() => setCompleteOpen(true)}
              disabled={actionBusy}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tActions('completeAndPrescribe')}
            </button>
          )}

          {canMarkNoShow && (
            <button
              onClick={() => {
                if (window.confirm(tActions('confirmNoShow'))) {
                  changeStatus('No Show');
                }
              }}
              disabled={actionBusy}
              className="w-full rounded-md border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tActions('markAsNoShow')}
            </button>
          )}

          {canModify && (
            <div className="flex gap-2">
              <button
                onClick={() => setRescheduleOpen(true)}
                disabled={actionBusy}
                className="flex-1 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reschedule
              </button>
              <button
                onClick={() => setCancelOpen(true)}
                disabled={actionBusy}
                className="flex-1 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel Appointment
              </button>
            </div>
          )}
          <button onClick={onClose}
            className="w-full rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
            Close
          </button>
        </div>
      </div>

      {detail && cancelOpen && (
        <CancelAppointmentModal
          isOpen={cancelOpen}
          onClose={() => setCancelOpen(false)}
          appointmentSid={detail.sid}
          appointmentDate={detail.date}
          invoiceStatus={detail.invoice_status}
          onCancel={handleDoctorCancel}
          actorRole="doctor"
        />
      )}

      {detail && rescheduleOpen && (
        <RescheduleModal
          isOpen={rescheduleOpen}
          onClose={() => setRescheduleOpen(false)}
          appointmentSid={detail.sid}
          doctorSid={detail.doctor_sid}
          serviceSid={detail.service_sid}
          currentDate={detail.date}
          onReschedule={handleDoctorReschedule}
          title="Reschedule appointment"
        />
      )}

      {detail && completeOpen && (
        <ConsultationCloseModal
          isOpen={completeOpen}
          onClose={() => setCompleteOpen(false)}
          appointmentSid={detail.sid}
          patientName={detail.patient_name}
          appointmentDate={detail.date}
          onCompleted={handleCompleted}
        />
      )}

      {detail && startVirtualOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b p-4">
              <h3 className="text-base font-bold text-gray-900">{tActions('startVirtualTitle')}</h3>
              <p className="mt-1 text-xs text-gray-500">{tActions('startVirtualHint')}</p>
            </div>
            <div className="space-y-3 p-4">
              {actionError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700">{tActions('meetingLinkLabel')}</label>
                <input
                  type="url"
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  disabled={actionBusy}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{tActions('meetingProviderLabel')}</label>
                <input
                  type="text"
                  value={meetingProvider}
                  onChange={(e) => setMeetingProvider(e.target.value)}
                  placeholder="Zoom, Google Meet, Teams..."
                  disabled={actionBusy}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
            </div>
            <div className="flex gap-2 border-t bg-gray-50 px-4 py-3">
              <button
                type="button"
                onClick={() => setStartVirtualOpen(false)}
                disabled={actionBusy}
                className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {tActions('cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmStartVirtual}
                disabled={actionBusy || !meetingLink.trim()}
                className="flex-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionBusy ? tActions('startingConsultation') : tActions('startAndNotify')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}