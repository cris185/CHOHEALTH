'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { patientProfile as profileApi, PatientProfile } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { User, Camera, Loader2, CheckCircle } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

export default function PatientProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    first_name: '', second_name: '', first_last_name: '', second_last_name: '',
    phone: '', address: '', date_of_birth: '', gender: '', blood_group: '',
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Patient') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('access_token') || '';
      profileApi.get(token).then((data) => {
        setProfile(data);
        setForm({
          first_name: data.first_name, second_name: data.second_name,
          first_last_name: data.first_last_name, second_last_name: data.second_last_name,
          phone: data.phone, address: data.address,
          date_of_birth: data.date_of_birth || '', gender: data.gender, blood_group: data.blood_group,
        });
        if (data.image) setImagePreview(data.image.startsWith('http') ? data.image : `${API_BASE}${data.image}`);
      }).catch(() => {}).finally(() => setLoading(false));
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setImageFile(file); setImagePreview(URL.createObjectURL(file)); }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(''); setSuccess(false); setSaving(true);
    const token = localStorage.getItem('access_token') || '';
    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => formData.append(key, value));
    if (imageFile) formData.append('image', imageFile);

    try {
      const updated = await profileApi.update(formData, token);
      setProfile(updated); setSuccess(true); setImageFile(null);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const apiError = err as { data?: Record<string, string[]> };
      setError(apiError?.data ? Object.values(apiError.data).flat().join(' ') : 'Error saving profile.');
    } finally { setSaving(false); }
  };

  if (authLoading || loading || !user) return null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <User className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold tracking-tight">Edit Profile</h2>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={imagePreview || undefined} />
                <AvatarFallback className="text-xl">{form.first_name?.[0]}{form.first_last_name?.[0]}</AvatarFallback>
              </Avatar>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90">
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </div>
            <div>
              <CardTitle>{profile?.full_name || 'Patient'}</CardTitle>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
            </div>
          </div>
        </CardHeader>

        <Separator />

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-6">
            {success && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
                <CheckCircle className="h-4 w-4" /> Profile updated successfully.
              </div>
            )}
            {error && <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t('common.firstName')} *</Label><Input name="first_name" required value={form.first_name} onChange={handleChange} /></div>
              <div className="space-y-2"><Label>{t('common.secondName')}</Label><Input name="second_name" value={form.second_name} onChange={handleChange} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t('common.firstLastName')} *</Label><Input name="first_last_name" required value={form.first_last_name} onChange={handleChange} /></div>
              <div className="space-y-2"><Label>{t('common.secondLastName')}</Label><Input name="second_last_name" value={form.second_last_name} onChange={handleChange} /></div>
            </div>
            <div className="space-y-2"><Label>Phone</Label><Input name="phone" value={form.phone} onChange={handleChange} /></div>
            <div className="space-y-2"><Label>Address</Label><Input name="address" value={form.address} onChange={handleChange} /></div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Blood Type</Label>
                <Select value={form.blood_group} onValueChange={(v) => setForm({ ...form, blood_group: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                      <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
