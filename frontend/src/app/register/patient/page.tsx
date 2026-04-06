'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';

export default function PatientRegisterPage() {
  const { registerPatient } = useAuth();
  const t = useTranslations();
  const [form, setForm] = useState({
    email: '',
    password: '',
    password_confirm: '',
    first_name: '',
    second_name: '',
    first_last_name: '',
    second_last_name: '',
    phone: '',
    address: '',
    date_of_birth: '',
    gender: '',
    blood_group: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await registerPatient(form);
    } catch (err: unknown) {
      const apiError = err as { data?: Record<string, string[]> };
      if (apiError?.data) {
        const messages = Object.values(apiError.data).flat().join(' ');
        setError(messages || t('register.error'));
      } else {
        setError(t('register.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-blue-600">{t('common.appName')}</h1>
          <p className="mt-2 text-gray-600">{t('register.patient.formTitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-lg bg-white p-8 shadow">
          {error && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">{t('common.firstName')} {t('common.required')}</label>
              <input id="first_name" name="first_name" required value={form.first_name} onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="second_name" className="block text-sm font-medium text-gray-700">{t('common.secondName')}</label>
              <input id="second_name" name="second_name" value={form.second_name} onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="first_last_name" className="block text-sm font-medium text-gray-700">{t('common.firstLastName')} {t('common.required')}</label>
              <input id="first_last_name" name="first_last_name" required value={form.first_last_name} onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="second_last_name" className="block text-sm font-medium text-gray-700">{t('common.secondLastName')}</label>
              <input id="second_last_name" name="second_last_name" value={form.second_last_name} onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">{t('common.email')} {t('common.required')}</label>
            <input id="email" name="email" type="email" required value={form.email} onChange={handleChange} placeholder={t('login.emailPlaceholder')}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">{t('common.phone')}</label>
            <input id="phone" name="phone" value={form.phone} onChange={handleChange} placeholder="+1 234 567 8900"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700">{t('register.patient.address')}</label>
            <input id="address" name="address" value={form.address} onChange={handleChange} placeholder={t('register.patient.addressPlaceholder')}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700">{t('register.patient.dateOfBirth')} {t('common.required')}</label>
              <input id="date_of_birth" name="date_of_birth" type="date" required value={form.date_of_birth} onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="gender" className="block text-sm font-medium text-gray-700">{t('register.patient.gender')} {t('common.required')}</label>
              <select id="gender" name="gender" required value={form.gender} onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">{t('register.patient.genderSelect')}</option>
                <option value="Male">{t('register.patient.genderMale')}</option>
                <option value="Female">{t('register.patient.genderFemale')}</option>
                <option value="Other">{t('register.patient.genderOther')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="blood_group" className="block text-sm font-medium text-gray-700">{t('register.patient.bloodGroup')}</label>
              <select id="blood_group" name="blood_group" value={form.blood_group} onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">{t('register.patient.bloodGroupSelect')}</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">{t('common.password')} {t('common.required')}</label>
              <input id="password" name="password" type="password" required minLength={8} value={form.password} onChange={handleChange} placeholder={t('register.patient.minChars')}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="password_confirm" className="block text-sm font-medium text-gray-700">{t('common.confirmPassword')} {t('common.required')}</label>
              <input id="password_confirm" name="password_confirm" type="password" required minLength={8} value={form.password_confirm} onChange={handleChange} placeholder="********"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50">
            {loading ? t('register.patient.submitting') : t('register.patient.submit')}
          </button>

          <p className="text-center text-sm text-gray-600">
            {t('register.hasAccount')}{' '}
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">{t('register.login')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}