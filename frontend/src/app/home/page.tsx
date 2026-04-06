'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import ServiceList from '@/components/ServiceList';

export default function HomePage() {
  const t = useTranslations();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="mx-auto max-w-7xl px-4 py-24 text-center">
          <h1 className="text-5xl font-bold">{t('home.hero')}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-blue-100">
            {t('home.subtitle')}
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            {user ? (
              <Link href="/dashboard"
                className="rounded-md bg-white px-8 py-3 text-lg font-semibold text-blue-600 shadow hover:bg-gray-100">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/register"
                  className="rounded-md bg-white px-8 py-3 text-lg font-semibold text-blue-600 shadow hover:bg-gray-100">
                  {t('home.cta')}
                </Link>
                <Link href="/login"
                  className="rounded-md border-2 border-white px-8 py-3 text-lg font-semibold text-white hover:bg-white hover:text-blue-600">
                  {t('home.login')}
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-center text-3xl font-bold text-gray-900">{t('home.features')}</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            <div className="rounded-lg bg-white p-8 shadow text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
                <svg className="h-7 w-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-gray-900">{t('home.feature1Title')}</h3>
              <p className="mt-2 text-gray-600">{t('home.feature1Desc')}</p>
            </div>

            <div className="rounded-lg bg-white p-8 shadow text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <svg className="h-7 w-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-gray-900">{t('home.feature2Title')}</h3>
              <p className="mt-2 text-gray-600">{t('home.feature2Desc')}</p>
            </div>

            <div className="rounded-lg bg-white p-8 shadow text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-purple-100">
                <svg className="h-7 w-7 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-gray-900">{t('home.feature3Title')}</h3>
              <p className="mt-2 text-gray-600">{t('home.feature3Desc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Services from backend */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-center text-3xl font-bold text-gray-900">{t('services.title')}</h2>
          <div className="mt-12">
            <ServiceList showBookButton={!user} />
          </div>
        </div>
      </section>
    </div>
  );
}