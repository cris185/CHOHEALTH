'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const PickerMap = dynamic(() => import('./AddressPickerMap'), { ssr: false });

export interface AddressValue {
  address: string;
  lat: number | null;
  lng: number | null;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
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
      const params = new URLSearchParams({ q, format: 'json', limit: '5' });
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
    setQuery(s.display_name);
    onChange({ address: s.display_name, lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleMapMove = async (lat: number, lng: number) => {
    onChange({ address: query, lat, lng });
    try {
      const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'json' });
      const res = await fetch(`${NOMINATIM_REVERSE}?${params}`, { headers: NOMINATIM_HEADERS });
      const data: { display_name?: string } = await res.json();
      if (data?.display_name) {
        setQuery(data.display_name);
        onChange({ address: data.display_name, lat, lng });
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
                  {s.display_name}
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
