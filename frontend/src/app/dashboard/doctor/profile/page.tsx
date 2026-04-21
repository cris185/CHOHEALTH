'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { doctorProfile as profileApi, doctorQualifications as qualApi, DoctorProfile, DoctorQualificationItem } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { User, Camera, Loader2, CheckCircle, Plus, Trash2, GraduationCap } from 'lucide-react';
import PhoneInput from '@/components/PhoneInput';
import CountrySelect from '@/components/CountrySelect';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

export default function DoctorProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const certInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [qualifications, setQualifications] = useState<DoctorQualificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Qualification form
  const [showQualForm, setShowQualForm] = useState(false);
  const [qualForm, setQualForm] = useState({ degree: '', institution: '', year: '' });
  const [certFile, setCertFile] = useState<File | null>(null);
  const [qualSaving, setQualSaving] = useState(false);

  const [form, setForm] = useState({
    first_name: '', second_name: '', first_last_name: '', second_last_name: '',
    mobile: '', country: '', bio: '', specialization: '', years_of_experience: 0,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'Doctor') { router.replace('/dashboard'); return; }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('access_token') || '';
      profileApi.get(token).then((data) => {
        setProfile(data);
        setForm({
          first_name: data.first_name, second_name: data.second_name,
          first_last_name: data.first_last_name, second_last_name: data.second_last_name,
          mobile: data.mobile, country: data.country, bio: data.bio,
          specialization: data.specialization,
          years_of_experience: data.years_of_experience,
        });
        if (data.image) setImagePreview(data.image.startsWith('http') ? data.image : `${API_BASE}${data.image}`);
      }).catch(() => {}).finally(() => setLoading(false));

      qualApi.list(token).then(setQualifications).catch(() => {});
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.name === 'years_of_experience' ? Number(e.target.value) : e.target.value;
    setForm({ ...form, [e.target.name]: value });
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
    Object.entries(form).forEach(([key, value]) => formData.append(key, String(value)));
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

  const handleAddQualification = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setQualSaving(true);
    const token = localStorage.getItem('access_token') || '';
    const formData = new FormData();
    formData.append('degree', qualForm.degree);
    formData.append('institution', qualForm.institution);
    if (qualForm.year) formData.append('year', qualForm.year);
    if (certFile) formData.append('certificate', certFile);

    try {
      const newQual = await qualApi.create(formData, token);
      setQualifications([newQual, ...qualifications]);
      setQualForm({ degree: '', institution: '', year: '' });
      setCertFile(null);
      setShowQualForm(false);
    } catch { /* ignore */ }
    finally { setQualSaving(false); }
  };

  const handleDeleteQualification = async (sid: string) => {
    const token = localStorage.getItem('access_token') || '';
    await qualApi.delete(sid, token).catch(() => {});
    setQualifications(qualifications.filter((q) => q.sid !== sid));
  };

  if (authLoading || loading || !user) return null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <User className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold tracking-tight">Edit Profile</h2>
      </div>

      {/* Profile Info Card */}
      <Card className="mb-6">
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
              <CardTitle>{profile?.full_name || 'Doctor'}</CardTitle>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Phone</Label><PhoneInput value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} /></div>
              <div className="space-y-2"><Label>Country</Label><CountrySelect value={form.country} onChange={(v) => setForm({ ...form, country: v })} /></div>
            </div>
            <div className="space-y-2"><Label>Specialization *</Label><Input name="specialization" required value={form.specialization} onChange={handleChange} /></div>
            <div className="space-y-2"><Label>Years of Experience</Label><Input name="years_of_experience" type="number" min={0} value={form.years_of_experience} onChange={handleChange} /></div>
            <div className="space-y-2"><Label>Biography</Label><Textarea name="bio" rows={4} value={form.bio} onChange={handleChange} /></div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </form>
      </Card>

      {/* Qualifications Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Qualifications
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowQualForm(!showQualForm)}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Add form */}
          {showQualForm && (
            <form onSubmit={handleAddQualification} className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Degree *</Label>
                  <Input placeholder="e.g. MD, PhD" required value={qualForm.degree}
                    onChange={(e) => setQualForm({ ...qualForm, degree: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Year</Label>
                  <Input type="number" placeholder="2020" value={qualForm.year}
                    onChange={(e) => setQualForm({ ...qualForm, year: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Institution *</Label>
                <Input placeholder="e.g. Harvard Medical School" required value={qualForm.institution}
                  onChange={(e) => setQualForm({ ...qualForm, institution: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Certificate (optional)</Label>
                <Input type="file" accept=".pdf,.jpg,.png" ref={certInputRef}
                  onChange={(e) => setCertFile(e.target.files?.[0] || null)} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={qualSaving}>
                  {qualSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Save
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowQualForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* List */}
          <div className={qualifications.length > 3 ? 'max-h-[320px] overflow-y-auto space-y-3 pr-1' : 'space-y-3'}>
          {qualifications.length === 0 && !showQualForm && (
            <div className="py-8 text-center">
              <GraduationCap className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">No qualifications added yet.</p>
              <p className="text-xs text-muted-foreground/60">Add your degrees and certifications.</p>
            </div>
          )}

          {qualifications.map((q, idx) => (
            <div key={q.sid || `qual-${idx}`} className="flex items-start justify-between rounded-lg border p-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{q.degree}</p>
                  {q.year && <Badge variant="secondary" className="text-[10px]">{q.year}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{q.institution}</p>
                {q.certificate && (
                  <a href={q.certificate.startsWith('http') ? q.certificate : `${API_BASE}${q.certificate}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline mt-1 inline-block">
                    View Certificate
                  </a>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                onClick={() => handleDeleteQualification(q.sid)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
