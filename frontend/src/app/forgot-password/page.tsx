'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { auth } from '@/lib/api';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, CheckCircle } from 'lucide-react';
import Image from 'next/image';

export default function ForgotPasswordPage() {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await auth.requestPasswordReset(email);
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Image src="/logo.png" alt="CHO Health" width={220} height={80} className="h-20 w-auto" />
          <h1 className="text-2xl font-bold tracking-tight">{t('common.appName')}</h1>
          <p className="text-sm text-muted-foreground">{t('forgotPassword.title')}</p>
        </div>

        <Card>
          {sent ? (
            <CardContent className="py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                {t('forgotPassword.success')}
              </p>
              <Link href="/login" className="mt-6 inline-block">
                <Button variant="outline">{t('forgotPassword.backToLogin')}</Button>
              </Link>
            </CardContent>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4 pt-6">
                <p className="text-sm text-muted-foreground">{t('forgotPassword.subtitle')}</p>

                {error && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">{t('common.email')}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('login.emailPlaceholder')}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? t('forgotPassword.submitting') : t('forgotPassword.submit')}
                </Button>

                <Link href="/login" className="text-sm text-primary hover:underline">
                  {t('forgotPassword.backToLogin')}
                </Link>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
