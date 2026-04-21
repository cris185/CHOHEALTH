'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const COUNTRIES = [
  { code: 'AR', flag: '🇦🇷', name: 'Argentina' },
  { code: 'BO', flag: '🇧🇴', name: 'Bolivia' },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: 'CL', flag: '🇨🇱', name: 'Chile' },
  { code: 'CO', flag: '🇨🇴', name: 'Colombia' },
  { code: 'CR', flag: '🇨🇷', name: 'Costa Rica' },
  { code: 'CU', flag: '🇨🇺', name: 'Cuba' },
  { code: 'DO', flag: '🇩🇴', name: 'Dominican Republic' },
  { code: 'EC', flag: '🇪🇨', name: 'Ecuador' },
  { code: 'SV', flag: '🇸🇻', name: 'El Salvador' },
  { code: 'FR', flag: '🇫🇷', name: 'France' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: 'GT', flag: '🇬🇹', name: 'Guatemala' },
  { code: 'HN', flag: '🇭🇳', name: 'Honduras' },
  { code: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: 'NI', flag: '🇳🇮', name: 'Nicaragua' },
  { code: 'PA', flag: '🇵🇦', name: 'Panama' },
  { code: 'PY', flag: '🇵🇾', name: 'Paraguay' },
  { code: 'PE', flag: '🇵🇪', name: 'Peru' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal' },
  { code: 'PR', flag: '🇵🇷', name: 'Puerto Rico' },
  { code: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'UY', flag: '🇺🇾', name: 'Uruguay' },
  { code: 'VE', flag: '🇻🇪', name: 'Venezuela' },
];

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

export default function CountrySelect({ value, onChange, placeholder = 'Select a country', required }: CountrySelectProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? '')} required={required}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {COUNTRIES.map((country) => (
          <SelectItem key={country.code} value={country.name}>
            <span className="mr-2">{country.flag}</span>
            {country.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
