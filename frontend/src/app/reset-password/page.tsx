'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { auth } from '@/lib/api';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import Image from 'next/image';
import PasswordStrength from '@/components/PasswordStrength';

export default function ResetPasswordPage() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!token || !email) {
    return (
      <div className="flex min-h-[calc(100vh-65px)] items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="mt-4 text-lg font-bold">{t('resetPassword.invalidLink')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('resetPassword.missingParams')}</p>
            <Link href="/forgot-password" className="mt-6 inline-block">
              <Button>Request New Link</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await auth.confirmPasswordReset({
        email,
        token,
        new_password: newPassword,
        new_password_confirm: confirmPassword,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string | string[] } };
      const detail = apiError?.data?.detail;
      if (Array.isArray(detail)) setError(detail.join(' '));
      else setError(detail || t('resetPassword.invalidLink'));
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
          <p className="text-sm text-muted-foreground">{t('resetPassword.title')}</p>
        </div>

        <Card>
          {success ? (
            <CardContent className="py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-7 w-7 text-emerald-600" />
              </div>
              <h2 className="mt-4 text-lg font-bold">{t('resetPassword.success')}</h2>
              <Link href="/login" className="mt-6 inline-block">
                <Button>{t('resetPassword.goToLogin')}</Button>
              </Link>
            </CardContent>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4 pt-6">
                <p className="text-sm text-muted-foreground">{t('resetPassword.subtitle')}</p>

                {error && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="new_password">{t('resetPassword.newPassword')}</Label>
                  <PasswordInput
                    id="new_password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                  />
                  <PasswordStrength password={newPassword} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm_password">{t('resetPassword.confirmPassword')}</Label>
                  <PasswordInput
                    id="confirm_password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                  />
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? t('resetPassword.submitting') : t('resetPassword.submit')}
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
