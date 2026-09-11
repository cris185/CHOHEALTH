'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const PickerMap = dynamic(() => import('./AddressPickerMap'), { ssr: false });

export interface AddressValue {
  address: string;
  lat: number | null;
  lng: number | null;
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
}

interface NominatimResult {
  display_name: string;
  address?: NominatimAddress;
  lat: string;
  lon: string;
}

// Nominatim's display_name spells out the full administrative hierarchy —
// comuna, "Perímetro Urbano", metro area, department, the regional
// "RAP" body, postcode, country — accurate but unreadable as a delivery
// address. Built from the same `address` object's individual fields
// instead: street + neighbourhood + city, the parts a person actually
// reads. Falls back to display_name if the structured fields are missing.
function formatAddress(result: { display_name: string; address?: NominatimAddress }): string {
  const addr = result.address;
  if (!addr) return result.display_name;
  const street = [addr.road, addr.house_number].filter(Boolean).join(' ');
  const area = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district;
  const city = addr.city || addr.town || addr.village;
  const parts = [street, area, city].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : result.display_name;
}

// Same free, no-API-key provider used everywhere else in this project for
// maps/geocoding (delivery.geocoding on the backend, DeliveryMap on the web).
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_HEADERS = { 'Accept-Language': 'es' };
// Medellín — centers the map somewhere useful before the patient has typed
// or tapped anything; matches where this project's branches actually are.
const DEFAULT_CENTER: [number, number] = [6.2442, -75.5812];
const SEARCH_DEBOUNCE_MS = 450;

export default function AddressPicker({
  value, onChange, disabled, placeholder, labels,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  disabled?: boolean;
  placeholder?: string;
  labels: {
    searching: string;
    noResults: string;
    pinPending: string;
    pinConfirmed: string;
  };
}) {
  const [query, setQuery] = useState(value.address);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the input in sync if the parent resets the form (e.g. modal reopened).
  useEffect(() => { setQuery(value.address); }, [value.address]);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 4) { setSuggestions([]); return; }
    setSearching(true);
    try {
      const params = new URLSearchParams({ q, format: 'json', limit: '5', addressdetails: '1' });
      const res = await fetch(`${NOMINATIM_SEARCH}?${params}`, { headers: NOMINATIM_HEADERS });
      const data: NominatimResult[] = await res.json();
      setSuggestions(data);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = (q: string) => {
    setQuery(q);
    // Typing invalidates whatever pin was previously confirmed — the
    // address text and the coordinates must always describe the same point.
    onChange({ address: q, lat: null, lng: null });
    setShowSuggestions(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), SEARCH_DEBOUNCE_MS);
  };

  const pickSuggestion = (s: NominatimResult) => {
    const label = formatAddress(s);
    setQuery(label);
    onChange({ address: label, lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleMapMove = async (lat: number, lng: number) => {
    onChange({ address: query, lat, lng });
    try {
      const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'json', addressdetails: '1' });
      const res = await fetch(`${NOMINATIM_REVERSE}?${params}`, { headers: NOMINATIM_HEADERS });
      const data: NominatimResult = await res.json();
      if (data?.display_name) {
        const label = formatAddress(data);
        setQuery(label);
        onChange({ address: label, lat, lng });
      }
    } catch {
      // Keep the coordinates even if reverse geocoding fails — the pin is
      // what matters; the address text just stays whatever it was.
    }
  };

  const hasPin = value.lat != null && value.lng != null;
  const center: [number, number] = hasPin ? [value.lat as number, value.lng as number] : DEFAULT_CENTER;

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        {showSuggestions && query.trim().length >= 4 && (
          <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
            {searching && (
              <li className="px-3 py-2 text-xs text-gray-400">{labels.searching}</li>
            )}
            {!searching && suggestions.length === 0 && (
              <li className="px-3 py-2 text-xs text-gray-400">{labels.noResults}</li>
            )}
            {!searching && suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onMouseDown={() => pickSuggestion(s)}
                  className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                >
                  {formatAddress(s)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200">
        <PickerMap center={center} marker={hasPin ? [value.lat as number, value.lng as number] : null} onMarkerMove={handleMapMove} />
      </div>

      <p className={`text-[11px] ${hasPin ? 'text-emerald-600' : 'text-gray-500'}`}>
        {hasPin ? labels.pinConfirmed : labels.pinPending}
      </p>
    </div>
  );
}
