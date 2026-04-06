'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { doctorProfile as profileApi, DoctorProfile } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

export default function DoctorProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    first_name: '',
    second_name: '',
    first_last_name: '',
    second_last_name: '',
    mobile: '',
    country: '',
    bio: '',
    specialization: '',
    qualification: '',
    years_of_experience: 0,
  });

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    if (!authLoading && user && user.user_type !== 'Doctor') router.push('/dashboard');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('access_token') || '';
      profileApi.get(token).then((data) => {
        setProfile(data);
        setForm({
          first_name: data.first_name,
          second_name: data.second_name,
          first_last_name: data.first_last_name,
          second_last_name: data.second_last_name,
          mobile: data.mobile,
          country: data.country,
          bio: data.bio,
          specialization: data.specialization,
          qualification: data.qualification,
          years_of_experience: data.years_of_experience,
        });
        if (data.image) {
          setImagePreview(data.image.startsWith('http') ? data.image : `${API_BASE}${data.image}`);
        }
      }).catch(() => {}).finally(() => setLoading(false));
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.name === 'years_of_experience' ? Number(e.target.value) : e.target.value;
    setForm({ ...form, [e.target.name]: value });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);

    const token = localStorage.getItem('access_token') || '';
    const formData = new FormData();

    Object.entries(form).forEach(([key, value]) => {
      formData.append(key, String(value));
    });

    if (imageFile) {
      formData.append('image', imageFile);
    }

    try {
      const updated = await profileApi.update(formData, token);
      setProfile(updated);
      setSuccess(true);
      setImageFile(null);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const apiError = err as { data?: Record<string, string[]> };
      if (apiError?.data) {
        const messages = Object.values(apiError.data).flat().join(' ');
        setError(messages || 'Error saving profile.');
      } else {
        setError('Error saving profile.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h2 className="mb-6 text-2xl font-bold text-gray-900">Edit Profile</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {success && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">Profile updated successfully.</div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        {/* Image */}
        <div className="flex items-center gap-6">
          <div className="relative">
            {imagePreview ? (
              <img src={imagePreview} alt="Profile" className="h-24 w-24 rounded-full object-cover" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-100">
                <svg className="h-12 w-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}
          </div>
          <div>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50">
              Change Photo
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            <p className="mt-1 text-xs text-gray-500">JPG, PNG. Max 5MB.</p>
          </div>
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input type="email" value={profile?.email || ''} disabled
            className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500" />
        </div>

        {/* Names */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">{t('common.firstName')} *</label>
            <input id="first_name" name="first_name" required value={form.first_name} onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="second_name" className="block text-sm font-medium text-gray-700">{t('common.secondName')}</label>
            <input id="second_name" name="second_name" value={form.second_name} onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="first_last_name" className="block text-sm font-medium text-gray-700">{t('common.firstLastName')} *</label>
            <input id="first_last_name" name="first_last_name" required value={form.first_last_name} onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="second_last_name" className="block text-sm font-medium text-gray-700">{t('common.secondLastName')}</label>
            <input id="second_last_name" name="second_last_name" value={form.second_last_name} onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="mobile" className="block text-sm font-medium text-gray-700">Phone</label>
            <input id="mobile" name="mobile" value={form.mobile} onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-gray-700">Country</label>
            <input id="country" name="country" value={form.country} onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>

        {/* Professional */}
        <div>
          <label htmlFor="specialization" className="block text-sm font-medium text-gray-700">Specialization *</label>
          <input id="specialization" name="specialization" required value={form.specialization} onChange={handleChange}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>

        <div>
          <label htmlFor="qualification" className="block text-sm font-medium text-gray-700">Qualifications *</label>
          <input id="qualification" name="qualification" required value={form.qualification} onChange={handleChange}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>

        <div>
          <label htmlFor="years_of_experience" className="block text-sm font-medium text-gray-700">Years of Experience</label>
          <input id="years_of_experience" name="years_of_experience" type="number" min={0} value={form.years_of_experience} onChange={handleChange}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>

        <div>
          <label htmlFor="bio" className="block text-sm font-medium text-gray-700">Biography</label>
          <textarea id="bio" name="bio" rows={4} value={form.bio} onChange={handleChange}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>

        <button type="submit" disabled={saving}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
