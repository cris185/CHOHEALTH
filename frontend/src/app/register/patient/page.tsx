'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Heart, Loader2 } from 'lucide-react';

export default function PatientRegisterPage() {
  const { registerPatient } = useAuth();
  const t = useTranslations();
  const [form, setForm] = useState({
    email: '', password: '', password_confirm: '',
    first_name: '', second_name: '', first_last_name: '', second_last_name: '',
    phone: '', address: '', date_of_birth: '', gender: '', blood_group: '',
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
      await registerPatient(form);
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
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Heart className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('common.appName')}</h1>
          <p className="text-sm text-muted-foreground">{t('register.patient.formTitle')}</p>
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

              <div className="space-y-2">
                <Label htmlFor="phone">{t('common.phone')}</Label>
                <Input id="phone" name="phone" value={form.phone} onChange={handleChange} placeholder="+1 234 567 8900" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">{t('register.patient.address')}</Label>
                <Input id="address" name="address" value={form.address} onChange={handleChange} placeholder={t('register.patient.addressPlaceholder')} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date_of_birth">{t('register.patient.dateOfBirth')} *</Label>
                  <Input id="date_of_birth" name="date_of_birth" type="date" required value={form.date_of_birth} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label>{t('register.patient.gender')} *</Label>
                  <Select required value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                    <SelectTrigger><SelectValue placeholder={t('register.patient.genderSelect')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">{t('register.patient.genderMale')}</SelectItem>
                      <SelectItem value="Female">{t('register.patient.genderFemale')}</SelectItem>
                      <SelectItem value="Other">{t('register.patient.genderOther')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('register.patient.bloodGroup')}</Label>
                  <Select value={form.blood_group} onValueChange={(v) => setForm({ ...form, blood_group: v })}>
                    <SelectTrigger><SelectValue placeholder={t('register.patient.bloodGroupSelect')} /></SelectTrigger>
                    <SelectContent>
                      {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                        <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">{t('common.password')} *</Label>
                  <Input id="password" name="password" type="password" required minLength={8} value={form.password} onChange={handleChange} placeholder={t('register.patient.minChars')} />
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
                {loading ? t('register.patient.submitting') : t('register.patient.submit')}
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
