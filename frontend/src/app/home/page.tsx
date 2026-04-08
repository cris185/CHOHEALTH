'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import ServiceCarousel from '@/components/ServiceCarousel';
import { CalendarDays, FileText, UserCheck, Star, ArrowRight } from 'lucide-react';

export default function HomePage() {
  const t = useTranslations();
  const { user } = useAuth();

  const features = [
    { icon: CalendarDays, title: t('home.feature1Title'), desc: t('home.feature1Desc'), color: 'bg-blue-100 text-blue-600' },
    { icon: FileText, title: t('home.feature2Title'), desc: t('home.feature2Desc'), color: 'bg-emerald-100 text-emerald-600' },
    { icon: UserCheck, title: t('home.feature3Title'), desc: t('home.feature3Desc'), color: 'bg-purple-100 text-purple-600' },
  ];

  const testimonials = [
    { quote: t('home.testimonial1'), author: t('home.testimonial1Author'), role: t('home.testimonial1Role'), initials: 'SJ' },
    { quote: t('home.testimonial2'), author: t('home.testimonial2Author'), role: t('home.testimonial2Role'), initials: 'MC' },
    { quote: t('home.testimonial3'), author: t('home.testimonial3Author'), role: t('home.testimonial3Role'), initials: 'ER' },
    { quote: t('home.testimonial4'), author: t('home.testimonial4Author'), role: t('home.testimonial4Role'), initials: 'JP' },
    { quote: t('home.testimonial5'), author: t('home.testimonial5Author'), role: t('home.testimonial5Role'), initials: 'AM' },
    { quote: t('home.testimonial6'), author: t('home.testimonial6Author'), role: t('home.testimonial6Role'), initials: 'LT' },
    { quote: t('home.testimonial7'), author: t('home.testimonial7Author'), role: t('home.testimonial7Role'), initials: 'RW' },
    { quote: t('home.testimonial8'), author: t('home.testimonial8Author'), role: t('home.testimonial8Role'), initials: 'MS' },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-blue-700 text-primary-foreground">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 lg:py-32">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-6">
              <div className="flex items-center">
                <Image src="/logo.png" alt="CHO Health" width={280} height={100} className="h-28 w-auto brightness-0 invert" />
              </div>
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              {t('home.hero')}
            </h1>
            <p className="mt-6 text-lg text-white/80 leading-relaxed">
              {t('home.subtitle')}
            </p>
            <div className="mt-10 flex items-center gap-4">
              {user ? (
                <Link href="/dashboard">
                  <Button size="lg" variant="secondary">Dashboard <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </Link>
              ) : (
                <>
                  <Link href="/register">
                    <Button size="lg" variant="secondary">{t('home.cta')} <ArrowRight className="ml-2 h-4 w-4" /></Button>
                  </Link>
                  <Link href="/login">
                    <Button size="lg" className="bg-white/20 text-white border-2 border-white/40 hover:bg-white hover:text-primary">{t('home.login')}</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="grid grid-cols-3 gap-8 text-center">
            <div>
              <p className="text-3xl font-bold text-primary">50+</p>
              <p className="text-sm text-muted-foreground">{t('home.statDoctors')}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary">1,000+</p>
              <p className="text-sm text-muted-foreground">{t('home.statPatients')}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary">5,000+</p>
              <p className="text-sm text-muted-foreground">{t('home.statAppointments')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">{t('home.features')}</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <Card key={f.title} className="text-center transition-all hover:shadow-md">
                  <CardContent className="pt-8 pb-6">
                    <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-xl ${f.color}`}>
                      <Icon className="h-7 w-7" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="border-y bg-muted/30 py-20">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">{t('services.title')}</h2>
          <div className="mt-12">
            <ServiceCarousel showBookButton={!user} />
          </div>
        </div>
      </section>

      {/* Testimonials Marquee */}
      <section className="py-20 overflow-hidden">
        <style>{`
          @keyframes scroll-left {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .marquee-track {
            animation: scroll-left 45s linear infinite;
          }
          .marquee-container:hover .marquee-track {
            animation-play-state: paused;
          }
        `}</style>

        <div className="mx-auto max-w-7xl px-4 mb-12">
          <h2 className="text-center text-3xl font-bold tracking-tight">{t('home.testimonialsTitle')}</h2>
        </div>

        <div className="marquee-container relative">
          <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24" style={{ background: 'linear-gradient(to right, var(--background), transparent)' }} />
          <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24" style={{ background: 'linear-gradient(to left, var(--background), transparent)' }} />

          <div className="marquee-track flex w-max">
            {[...testimonials, ...testimonials].map((item, idx) => (
              <div key={`${item.author}-${idx}`} className="w-[350px] shrink-0 px-3">
                <Card className="h-[240px] flex flex-col transition-shadow hover:shadow-lg">
                  <CardContent className="pt-6 flex flex-col flex-1">
                    <div className="flex gap-0.5 mb-3">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground italic leading-relaxed flex-1 line-clamp-4">
                      &ldquo;{item.quote}&rdquo;
                    </p>
                    <Separator className="my-3" />
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {item.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold">{item.author}</p>
                        <p className="text-xs text-muted-foreground">{item.role}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-primary to-blue-700 py-20">
        <div className="mx-auto max-w-2xl px-4 text-center text-primary-foreground">
          <h2 className="text-3xl font-bold tracking-tight">{t('home.ctaTitle')}</h2>
          <p className="mt-4 text-lg text-white/80">{t('home.ctaSubtitle')}</p>
          <Link href="/register" className="mt-8 inline-block">
            <Button size="lg" variant="secondary">{t('home.ctaButton')} <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card py-8">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <Image src="/logo.png" alt="CHO Health" width={180} height={60} className="h-16 w-auto" />
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} {t('common.appName')}. {t('home.footerCopyright')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
