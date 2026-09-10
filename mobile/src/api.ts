import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://chohealth-api.cristianpuentes.com/api';

export const ACCESS_TOKEN_KEY = 'access_token';
export const REFRESH_TOKEN_KEY = 'refresh_token';

interface FetchOptions extends RequestInit {
  token?: string;
}

// Access tokens expire after 30 min (SIMPLE_JWT.ACCESS_TOKEN_LIFETIME) — a
// courier's shift routinely outlasts that. These let AuthContext learn about
// a token silently refreshed mid-request (so its React state — and every
// call built from it — picks up the new one) or a refresh that failed
// outright (refresh token itself expired/revoked -> force logout). Set once
// from AuthContext; a plain module-level pair avoids a circular import
// between this file and the context that wraps it.
let onTokenRefreshed: ((accessToken: string) => void) | null = null;
let onAuthExpired: (() => void) | null = null;

export function setAuthHandlers(handlers: {
  onTokenRefreshed?: (accessToken: string) => void;
  onAuthExpired?: () => void;
}) {
  onTokenRefreshed = handlers.onTokenRefreshed ?? null;
  onAuthExpired = handlers.onAuthExpired ?? null;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_URL}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });
    if (!res.ok) throw new Error('refresh failed');
    const data: { access: string } = await res.json();
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, data.access);
    onTokenRefreshed?.(data.access);
    return data.access;
  } catch {
    await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
    onAuthExpired?.();
    return null;
  }
}

// Same shape as the web's fetchAPI (frontend/src/lib/api.ts) — throws
// { status, data } on a non-ok response, so callers can read
// err.data.detail the same way the web app does. Unlike the web version,
// this one transparently refreshes and retries once on a 401 — see the
// token-lifetime note above.
async function fetchAPI(endpoint: string, options: FetchOptions = {}) {
  const { token, headers, ...rest } = options;

  const doFetch = (authToken?: string) =>
    fetch(`${API_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
      ...rest,
    });

  let res = await doFetch(token);
  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) res = await doFetch(newToken);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, data };
  return data;
}

async function fetchMultipart(endpoint: string, options: FetchOptions = {}) {
  const { token, headers, ...rest } = options;

  const doFetch = (authToken?: string) =>
    fetch(`${API_URL}${endpoint}`, {
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
      ...rest,
    });

  let res = await doFetch(token);
  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) res = await doFetch(newToken);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, data };
  return data;
}

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

// ---- Auth ----

export interface User {
  id: number;
  sid: string;
  email: string;
  username: string;
  user_type: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}

export const auth = {
  login: (email: string, password: string): Promise<LoginResponse> =>
    fetchAPI('/auth/login/', { method: 'POST', body: JSON.stringify({ email, password }) }),

  me: (token: string): Promise<User> => fetchAPI('/auth/me/', { token }),

  logout: (refresh: string, token: string) =>
    fetchAPI('/auth/logout/', { method: 'POST', body: JSON.stringify({ refresh }), token }),
};

// ---- Delivery person profile + shift state ----

export interface DeliveryPersonProfile {
  sid: string;
  email: string;
  full_name: string;
  image: string;
  first_name: string;
  second_name: string;
  first_last_name: string;
  second_last_name: string;
  phone: string;
  on_duty_status: 'off_duty' | 'on_duty' | 'on_break';
}

export interface PendingOffer {
  sid: string;
  delivery_sid: string;
  address: string;
  expires_at: string;
}

export interface DeliveryHistoryItem {
  sid: string;
  order_sid: string;
  stage: 'picked_up' | 'on_the_way' | 'delivered';
  address: string;
  created_at: string;
  delivered_at: string | null;
}

export const deliveryPerson = {
  profile: (token: string): Promise<DeliveryPersonProfile> => fetchAPI('/delivery/profile/', { token }),

  updateProfile: (data: FormData, token: string): Promise<DeliveryPersonProfile> =>
    fetchMultipart('/delivery/profile/', { method: 'PATCH', body: data, token }),

  clockIn: (token: string): Promise<{ on_duty_status: string }> =>
    fetchAPI('/delivery/clock-in/', { method: 'POST', token }),

  clockOut: (token: string): Promise<{ on_duty_status: string }> =>
    fetchAPI('/delivery/clock-out/', { method: 'POST', token }),

  breakStart: (token: string): Promise<{ on_duty_status: string }> =>
    fetchAPI('/delivery/break/start/', { method: 'POST', token }),

  breakEnd: (token: string): Promise<{ on_duty_status: string }> =>
    fetchAPI('/delivery/break/end/', { method: 'POST', token }),

  pingLocation: (latitude: number, longitude: number, token: string) =>
    fetchAPI('/delivery/location/', { method: 'PATCH', body: JSON.stringify({ latitude, longitude }), token }),

  myOffer: (token: string): Promise<PendingOffer | null> => fetchAPI('/delivery/offers/mine/', { token }),

  acceptOffer: (sid: string, token: string): Promise<{ delivery_sid: string; status: string }> =>
    fetchAPI(`/delivery/offers/${sid}/accept/`, { method: 'POST', token }),

  declineOffer: (sid: string, token: string): Promise<{ status: string }> =>
    fetchAPI(`/delivery/offers/${sid}/decline/`, { method: 'POST', token }),

  deliveries: (token: string): Promise<DeliveryHistoryItem[]> => fetchAPI('/delivery/deliveries/', { token }),
};

// ---- Delivery stage actions (base.delivery_views) ----

export const deliveryActions = {
  startTransit: (deliverySid: string, token: string): Promise<{ stage: string }> =>
    fetchAPI(`/deliveries/${deliverySid}/start-transit/`, { method: 'POST', token }),

  // Uploaded via expo-file-system's native multipart uploader rather than
  // fetch()+FormData — appending a { uri, name, type } file part to RN's
  // FormData throws "Unsupported FormDataPart implementation" under the New
  // Architecture. uploadAsync builds the multipart body natively instead,
  // which also means it bypasses fetchAPI's automatic 401-refresh-and-retry
  // — replicated here by hand since this is the one action a courier really
  // can't afford to lose to an expired access token mid-delivery.
  arrived: async (
    deliverySid: string,
    data: { latitude: number; longitude: number; photoUri: string },
    token: string,
  ): Promise<{ stage: string; within_geofence: boolean | null }> => {
    const upload = (authToken: string) =>
      FileSystem.uploadAsync(`${API_URL}/deliveries/${deliverySid}/arrived/`, data.photoUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'photo',
        mimeType: 'image/jpeg',
        parameters: {
          latitude: String(data.latitude),
          longitude: String(data.longitude),
        },
        headers: { Authorization: `Bearer ${authToken}` },
      });

    let result = await upload(token);
    if (result.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) result = await upload(newToken);
    }

    const body = result.body ? JSON.parse(result.body) : null;
    if (result.status < 200 || result.status >= 300) {
      throw { status: result.status, data: body };
    }
    return body;
  },
};
