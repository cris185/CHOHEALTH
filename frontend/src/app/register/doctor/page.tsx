'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';

export default function DoctorRegisterPage() {
  const { registerDoctor } = useAuth();
  const t = useTranslations();
  const [form, setForm] = useState({
    email: '', password: '', password_confirm: '',
    first_name: '', second_name: '', first_last_name: '', second_last_name: '',
    mobile: '', country: '', bio: '', specialization: '', years_of_experience: 0,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.name === 'years_of_experience' ? Number(e.target.value) : e.target.value;
    setForm({ ...form, [e.target.name]: value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await registerDoctor(form);
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
          <h1 className="text-2xl font-bold tracking-tight">{t('common.appName')}</h1>
          <p className="text-sm text-muted-foreground">{t('register.doctor.formTitle')}</p>
        </div>

        <Card>
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mobile">{t('register.doctor.mobile')}</Label>
                  <Input id="mobile" name="mobile" value={form.mobile} onChange={handleChange} placeholder="+1 234 567 8900" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">{t('register.doctor.country')}</Label>
                  <Input id="country" name="country" value={form.country} onChange={handleChange} placeholder={t('register.doctor.countryPlaceholder')} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="specialization">{t('register.doctor.specialization')} *</Label>
                <Input id="specialization" name="specialization" required value={form.specialization} onChange={handleChange} placeholder={t('register.doctor.specializationPlaceholder')} />
              </div>


              <div className="space-y-2">
                <Label htmlFor="years_of_experience">{t('register.doctor.yearsOfExperience')} *</Label>
                <Input id="years_of_experience" name="years_of_experience" type="number" min={0} required value={form.years_of_experience} onChange={handleChange} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">{t('register.doctor.bio')}</Label>
                <Textarea id="bio" name="bio" rows={3} value={form.bio} onChange={handleChange} placeholder={t('register.doctor.bioPlaceholder')} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">{t('common.password')} *</Label>
                  <Input id="password" name="password" type="password" required minLength={8} value={form.password} onChange={handleChange} placeholder={t('register.doctor.minChars')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password_confirm">{t('common.confirmPassword')} *</Label>
                  <Input id="password_confirm" name="password_confirm" type="password" required minLength={8} value={form.password_confirm} onChange={handleChange} placeholder="********" />
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? t('register.doctor.submitting') : t('register.doctor.submit')}
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
