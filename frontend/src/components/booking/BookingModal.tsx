'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { appointments, branches as branchesApi, BranchItem } from '@/lib/api';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctorSid: string;
  serviceSid: string;
  date: string;
  time: string;
  doctorName: string;
  serviceName: string;
  serviceDuration: number;
}

export default function BookingModal({
  isOpen, onClose, doctorSid, serviceSid, date, time, doctorName, serviceName, serviceDuration,
}: BookingModalProps) {
  const t = useTranslations();
  const router = useRouter();
  const [mode, setMode] = useState('In-Person');
  const [branchSid, setBranchSid] = useState('');
  const [branchesList, setBranchesList] = useState<BranchItem[]>([]);
  const [issues, setIssues] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && mode === 'In-Person') {
      branchesApi.list().then(setBranchesList).catch(() => {});
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const dateTime = `${date}T${time}:00`;
  const formattedDate = new Date(dateTime).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const token = localStorage.getItem('access_token');
    if (!token) {
      setError('Not authenticated.');
      setLoading(false);
      return;
    }

    try {
      await appointments.create({
        doctor_sid: doctorSid,
        service_sid: serviceSid,
        date: dateTime,
        mode,
        branch_sid: mode === 'In-Person' ? branchSid : '',
        issues,
        symptoms,
        notes,
      }, token);

      router.push('/dashboard/patient');
    } catch (err: unknown) {
      const apiError = err as { data?: Record<string, string[]> };
      if (apiError?.data) {
        const messages = Object.values(apiError.data).flat().join(' ');
        setError(messages || t('booking.error'));
      } else {
        setError(t('booking.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t('booking.confirmBooking')}</h2>
            <p className="text-sm text-gray-500">{formattedDate} &middot; {time}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-3 text-sm">
            <div>
              <span className="text-gray-500">{t('booking.doctor')}:</span>
              <p className="font-medium text-gray-900">{doctorName}</p>
            </div>
            <div>
              <span className="text-gray-500">{t('booking.service')}:</span>
              <p className="font-medium text-gray-900">{serviceName}</p>
            </div>
            <div>
              <span className="text-gray-500">{t('booking.duration')}:</span>
              <p className="font-medium text-gray-900">{serviceDuration} min</p>
            </div>
            <div>
              <span className="text-gray-500">{t('booking.time')}:</span>
              <p className="font-medium text-gray-900">{time}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t('booking.mode')}</label>
            <div className="mt-1 flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="mode" value="In-Person" checked={mode === 'In-Person'} onChange={(e) => setMode(e.target.value)}
                  className="text-blue-600" />
                <span className="text-sm">{t('booking.inPerson')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="mode" value="Virtual" checked={mode === 'Virtual'} onChange={(e) => setMode(e.target.value)}
                  className="text-blue-600" />
                <span className="text-sm">{t('booking.virtual')}</span>
              </label>
            </div>
          </div>

          {mode === 'In-Person' && (
            <div>
              <label htmlFor="branch" className="block text-sm font-medium text-gray-700">{t('booking.branch')}</label>
              <select id="branch" value={branchSid} onChange={(e) => setBranchSid(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">{t('booking.selectBranch')}</option>
                {branchesList.map((b) => (
                  <option key={b.sid} value={b.sid}>{b.name} - {b.address}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="issues" className="block text-sm font-medium text-gray-700">{t('booking.issues')}</label>
            <textarea id="issues" rows={2} value={issues} onChange={(e) => setIssues(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <label htmlFor="symptoms" className="block text-sm font-medium text-gray-700">{t('booking.symptoms')}</label>
            <textarea id="symptoms" rows={2} value={symptoms} onChange={(e) => setSymptoms(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">{t('booking.notes')}</label>
            <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? t('booking.submitting') : t('booking.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
