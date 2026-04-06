'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function RegisterPage() {
  const t = useTranslations();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-blue-600">{t('common.appName')}</h1>
          <p className="mt-2 text-gray-600">{t('register.selectTitle')}</p>
        </div>

        <div className="space-y-4">
          <Link href="/register/patient"
            className="flex items-center gap-4 rounded-lg bg-white p-6 shadow transition hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{t('register.patient.title')}</h2>
              <p className="text-sm text-gray-500">{t('register.patient.subtitle')}</p>
            </div>
          </Link>

          <Link href="/register/doctor"
            className="flex items-center gap-4 rounded-lg bg-white p-6 shadow transition hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{t('register.doctor.title')}</h2>
              <p className="text-sm text-gray-500">{t('register.doctor.subtitle')}</p>
            </div>
          </Link>
        </div>

        <p className="text-center text-sm text-gray-600">
          {t('register.hasAccount')}{' '}
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">{t('register.login')}</Link>
        </p>
      </div>
    </div>
  );
}