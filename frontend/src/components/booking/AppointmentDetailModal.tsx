'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { appointments as appointmentsApi, DoctorAppointmentDetail } from '@/lib/api';

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
}

export default function AppointmentDetailModal({ isOpen, onClose, appointmentSid }: AppointmentDetailModalProps) {
  const t = useTranslations();
  const [detail, setDetail] = useState<DoctorAppointmentDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && appointmentSid) {
      setLoading(true);
      const token = localStorage.getItem('access_token') || '';
      appointmentsApi.doctorDetail(appointmentSid, token)
        .then(setDetail)
        .catch(() => setDetail(null))
        .finally(() => setLoading(false));
    }
  }, [isOpen, appointmentSid]);

  if (!isOpen) return null;

  const patientImage = detail?.patient_image
    ? detail.patient_image.startsWith('http') ? detail.patient_image : `${API_BASE}${detail.patient_image}`
    : null;

  const statusColors: Record<string, string> = {
    Pending: 'bg-blue-100 text-blue-700',
    Confirmed: 'bg-green-100 text-green-700',
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

        <div className="border-t p-4">
          <button onClick={onClose}
            className="w-full rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}