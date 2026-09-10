'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import PasswordStrength from '@/components/PasswordStrength';
import PhoneInput from '@/components/PhoneInput';

export default function DeliveryRegisterPage() {
  const { registerDelivery } = useAuth();
  const t = useTranslations();
  const [form, setForm] = useState({
    email: '', password: '', password_confirm: '',
    first_name: '', second_name: '', first_last_name: '', second_last_name: '',
    phone: '', gps_consent: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await registerDelivery(form);
    } catch (err: unknown) {
      const apiError = err as { data?: Record<string, string[]> };
      if (apiError?.data) {
        setError(Object.values(apiError.data).flat().join(' ') || t('register.error'));
      } else {
        setError(t('register.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Image src="/logo.png" alt="CHO Health" width={220} height={80} className="h-20 w-auto" />
          <h1 className="section-title-mark text-2xl font-bold tracking-tight">{t('common.appName')}</h1>
          <p className="text-sm text-muted-foreground">{t('register.delivery.formTitle')}</p>
        </div>

        <Card className="glass-panel">
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-6">
              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">{t('common.firstName')} *</Label>
                  <Input id="first_name" name="first_name" required value={form.first_name} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="second_name">{t('common.secondName')}</Label>
                  <Input id="second_name" name="second_name" value={form.second_name} onChange={handleChange} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_last_name">{t('common.firstLastName')} *</Label>
                  <Input id="first_last_name" name="first_last_name" required value={form.first_last_name} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="second_last_name">{t('common.secondLastName')}</Label>
                  <Input id="second_last_name" name="second_last_name" value={form.second_last_name} onChange={handleChange} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('common.email')} *</Label>
                <Input id="email" name="email" type="email" required value={form.email} onChange={handleChange} placeholder={t('login.emailPlaceholder')} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t('common.phone')}</Label>
                <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">{t('common.password')} *</Label>
                  <PasswordInput id="password" name="password" required minLength={8} value={form.password} onChange={handleChange} placeholder={t('register.delivery.minChars')} />
                  <PasswordStrength password={form.password} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password_confirm">{t('common.confirmPassword')} *</Label>
                  <PasswordInput id="password_confirm" name="password_confirm" required minLength={8} value={form.password_confirm} onChange={handleChange} placeholder="********" />
                </div>
              </div>

              <label className="flex items-start gap-2 cursor-pointer px-1">
                <input
                  type="checkbox"
                  required
                  checked={form.gps_consent}
                  onChange={(e) => setForm({ ...form, gps_consent: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">{t('register.delivery.gpsConsent')}</span>
              </label>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? t('register.delivery.submitting') : t('register.delivery.submit')}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {t('register.hasAccount')}{' '}
                <Link href="/login" className="font-medium text-primary hover:underline">{t('register.login')}</Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
