const API_URL = process.env.NEXT_PUBLIC_API_URL;

function getLocale(): string {
  if (typeof document === 'undefined') return 'es';
  const match = document.cookie.match(/(?:^|; )locale=([^;]*)/);
  return match ? match[1] : 'es';
}

interface FetchOptions extends RequestInit {
  token?: string;
}

async function fetchAPI(endpoint: string, options: FetchOptions = {}) {
  const { token, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': getLocale(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...rest,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw { status: res.status, data };
  }

  return data;
}

async function fetchMultipart(endpoint: string, options: FetchOptions = {}) {
  const { token, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...rest,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw { status: res.status, data };
  }

  return data;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface RegisterResponse {
  user: User;
  tokens: {
    access: string;
    refresh: string;
  };
}

export interface User {
  id: number;
  sid: string;
  email: string;
  username: string;
  user_type: string;
}

export interface PatientRegisterData {
  email: string;
  password: string;
  password_confirm: string;
  first_name: string;
  second_name?: string;
  first_last_name: string;
  second_last_name?: string;
  phone?: string;
  address?: string;
  date_of_birth: string;
  gender: string;
  blood_group?: string;
}

export interface DoctorRegisterData {
  email: string;
  password: string;
  password_confirm: string;
  first_name: string;
  second_name?: string;
  first_last_name: string;
  second_last_name?: string;
  mobile?: string;
  country?: string;
  bio?: string;
  specialization: string;
  years_of_experience: number;
}

export const auth = {
  login: (email: string, password: string): Promise<LoginResponse> =>
    fetchAPI('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  registerPatient: (data: PatientRegisterData): Promise<RegisterResponse> =>
    fetchAPI('/auth/register/patient/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  registerDoctor: (data: DoctorRegisterData): Promise<RegisterResponse> =>
    fetchAPI('/auth/register/doctor/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: (refresh: string, token: string) =>
    fetchAPI('/auth/logout/', {
      method: 'POST',
      body: JSON.stringify({ refresh }),
      token,
    }),

  me: (token: string): Promise<User> =>
    fetchAPI('/auth/me/', { token }),

  requestPasswordReset: (email: string) =>
    fetchAPI('/auth/password-reset/request/', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  confirmPasswordReset: (data: { email: string; token: string; new_password: string; new_password_confirm: string }) =>
    fetchAPI('/auth/password-reset/confirm/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  refreshToken: (refresh: string): Promise<{ access: string }> =>
    fetchAPI('/auth/token/refresh/', {
      method: 'POST',
      body: JSON.stringify({ refresh }),
    }),
};

export interface DoctorQualificationItem {
  sid: string;
  degree: string;
  institution: string;
  year: number | null;
  certificate: string | null;
}

export interface ServiceDoctor {
  sid: string;
  full_name: string;
  image: string;
  specialization: string;
  qualifications: DoctorQualificationItem[];
  years_of_experience: number;
  bio: string;
}

export interface Service {
  sid: string;
  name: string;
  description: string;
  image: string;
  cost: string;
  duration_minutes: number;
  service_type: string;
  doctors: ServiceDoctor[];
  doctors_count: number;
}

export const services = {
  list: (): Promise<Service[]> =>
    fetchAPI('/services/'),

  detail: (sid: string): Promise<Service> =>
    fetchAPI(`/services/${sid}/`),
};

export interface DoctorScheduleEntry {
  day_of_week: number;
  day_name: string;
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  is_break: boolean;
  is_booked: boolean;
}

export interface ScheduleBlock {
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
}

export interface DayAvailability {
  date: string;
  schedules: ScheduleBlock[];
  slots: TimeSlot[];
}

export interface BranchItem {
  sid: string;
  name: string;
  address: string;
  phone: string;
}

export interface AppointmentCreateData {
  doctor_sid: string;
  service_sid: string;
  date: string;
  mode: string;
  branch_sid?: string;
  issues?: string;
  symptoms?: string;
  notes?: string;
}

export interface AppointmentItem {
  sid: string;
  date: string;
  status: string;
  mode: string;
  doctor_name: string;
  service_name: string | null;
  branch_name: string | null;
  issues: string;
  symptoms: string;
  notes: string;
  created_at: string;
}

export const doctors = {
  schedule: (sid: string): Promise<DoctorScheduleEntry[]> =>
    fetchAPI(`/doctors/${sid}/schedule/`),

  availableDays: (sid: string, month: string, serviceSid: string): Promise<string[]> =>
    fetchAPI(`/doctors/${sid}/available-days/?month=${month}&service_sid=${serviceSid}`),

  availableSlots: (sid: string, date: string, serviceSid: string): Promise<DayAvailability> =>
    fetchAPI(`/doctors/${sid}/available-slots/?date=${date}&service_sid=${serviceSid}`),
};

export interface DoctorAppointmentItem {
  sid: string;
  date: string;
  status: string;
  mode: string;
  patient_name: string;
  patient_image: string | null;
  service_name: string | null;
  service_duration: number;
  branch_name: string | null;
  issues: string;
  symptoms: string;
  notes: string;
  created_at: string;
}

export interface DoctorAppointmentDetail extends DoctorAppointmentItem {
  patient_email: string;
  patient_phone: string;
  patient_date_of_birth: string | null;
  patient_gender: string;
  patient_blood_group: string;
  room: string;
}

export const appointments = {
  create: (data: AppointmentCreateData, token: string): Promise<AppointmentItem> =>
    fetchAPI('/appointments/', { method: 'POST', body: JSON.stringify(data), token }),

  list: (token: string): Promise<AppointmentItem[]> =>
    fetchAPI('/appointments/my/', { token }),

  doctorList: (token: string, date?: string): Promise<DoctorAppointmentItem[]> =>
    fetchAPI(`/appointments/doctor/${date ? `?date=${date}` : ''}`, { token }),

  doctorDetail: (sid: string, token: string): Promise<DoctorAppointmentDetail> =>
    fetchAPI(`/appointments/doctor/${sid}/`, { token }),
};

export const branches = {
  list: (): Promise<BranchItem[]> =>
    fetchAPI('/branches/'),
};

export interface DoctorProfile {
  sid: string;
  email: string;
  full_name: string;
  image: string;
  first_name: string;
  second_name: string;
  first_last_name: string;
  second_last_name: string;
  mobile: string;
  country: string;
  bio: string;
  specialization: string;
  years_of_experience: number;
  qualifications: DoctorQualificationItem[];
}

export interface DoctorStats {
  total_appointments: number;
  today_appointments: number;
  completed_appointments: number;
  pending_appointments: number;
  total_patients: number;
  average_rating: number | null;
  total_reviews: number;
  total_revenue: number | null;
  unread_notifications: number;
}

export const doctorProfile = {
  get: (token: string): Promise<DoctorProfile> =>
    fetchAPI('/doctor/profile/', { token }),

  update: (data: FormData, token: string): Promise<DoctorProfile> =>
    fetchMultipart('/doctor/profile/', { method: 'PATCH', body: data, token }),
};

export const doctorQualifications = {
  list: (token: string): Promise<DoctorQualificationItem[]> =>
    fetchAPI('/doctor/qualifications/', { token }),

  create: (data: FormData, token: string): Promise<DoctorQualificationItem> =>
    fetchMultipart('/doctor/qualifications/', { method: 'POST', body: data, token }),

  delete: (sid: string, token: string) =>
    fetchAPI(`/doctor/qualifications/${sid}/`, { method: 'DELETE', token }),
};

export const doctorStats = {
  get: (token: string): Promise<DoctorStats> =>
    fetchAPI('/doctor/stats/', { token }),
};

export interface NotificationItem {
  sid: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  appointment: string | null;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const notifications = {
  list: (token: string, params?: { status?: string; page?: number }): Promise<PaginatedResponse<NotificationItem>> => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.page) searchParams.set('page', String(params.page));
    const query = searchParams.toString();
    return fetchAPI(`/notifications/${query ? `?${query}` : ''}`, { token });
  },

  markRead: (sid: string, token: string) =>
    fetchAPI(`/notifications/${sid}/read/`, { method: 'PATCH', token }),

  markAllRead: (token: string) =>
    fetchAPI('/notifications/mark-all-read/', { method: 'POST', token }),

  delete: (sid: string, token: string) =>
    fetchAPI(`/notifications/${sid}/`, { method: 'DELETE', token }),

  deleteAll: (token: string) =>
    fetchAPI('/notifications/delete-all/', { method: 'DELETE', token }),
};

export interface DoctorPaymentItem {
  sid: string;
  patient_name: string | null;
  service_name: string | null;
  invoice_number: string;
  amount: string;
  payment_method: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export interface DoctorPaymentStats {
  total_revenue: number;
  this_month_revenue: number;
  pending_amount: number;
}

export const doctorPayments = {
  list: (token: string, page?: number): Promise<PaginatedResponse<DoctorPaymentItem>> => {
    const query = page ? `?page=${page}` : '';
    return fetchAPI(`/doctor/payments/${query}`, { token });
  },

  stats: (token: string): Promise<DoctorPaymentStats> =>
    fetchAPI('/doctor/payments/stats/', { token }),
};

// ============================================================================
// Patient API
// ============================================================================

export interface PatientProfile {
  sid: string;
  email: string;
  full_name: string;
  image: string;
  first_name: string;
  second_name: string;
  first_last_name: string;
  second_last_name: string;
  phone: string;
  address: string;
  date_of_birth: string | null;
  gender: string;
  blood_group: string;
}

export interface PatientStats {
  total_appointments: number;
  upcoming_appointments: number;
  completed_appointments: number;
  total_medical_records: number;
  total_lab_results: number;
  unread_notifications: number;
}

export interface PatientPaymentItem {
  sid: string;
  doctor_name: string | null;
  service_name: string | null;
  invoice_number: string;
  amount: string;
  payment_method: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export interface PatientPaymentStats {
  total_paid: number;
  this_month_paid: number;
  pending_amount: number;
}

export const patientProfile = {
  get: (token: string): Promise<PatientProfile> =>
    fetchAPI('/patient/profile/', { token }),

  update: (data: FormData, token: string): Promise<PatientProfile> =>
    fetchMultipart('/patient/profile/', { method: 'PATCH', body: data, token }),
};

export const patientStats = {
  get: (token: string): Promise<PatientStats> =>
    fetchAPI('/patient/stats/', { token }),
};

export const patientNotifications = {
  list: (token: string, params?: { status?: string; page?: number }): Promise<PaginatedResponse<NotificationItem>> => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.page) searchParams.set('page', String(params.page));
    const query = searchParams.toString();
    return fetchAPI(`/patient/notifications/${query ? `?${query}` : ''}`, { token });
  },

  markRead: (sid: string, token: string) =>
    fetchAPI(`/patient/notifications/${sid}/read/`, { method: 'PATCH', token }),

  markAllRead: (token: string) =>
    fetchAPI('/patient/notifications/mark-all-read/', { method: 'POST', token }),

  delete: (sid: string, token: string) =>
    fetchAPI(`/patient/notifications/${sid}/`, { method: 'DELETE', token }),

  deleteAll: (token: string) =>
    fetchAPI('/patient/notifications/delete-all/', { method: 'DELETE', token }),
};

export const patientPayments = {
  list: (token: string, page?: number): Promise<PaginatedResponse<PatientPaymentItem>> => {
    const query = page ? `?page=${page}` : '';
    return fetchAPI(`/patient/payments/${query}`, { token });
  },

  stats: (token: string): Promise<PatientPaymentStats> =>
    fetchAPI('/patient/payments/stats/', { token }),
};

// ============================================================================
// Payment Flow API
// ============================================================================

export interface CreateAppointmentResponse {
  appointment_sid: string;
  invoice_sid: string;
  invoice_number: string;
  amount: string;
  service_name: string;
}

export interface StripeCheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface PayPalOrderResponse {
  approval_url: string;
  payment_id: string;
}

export const paymentFlow = {
  createAppointment: (data: AppointmentCreateData, token: string): Promise<CreateAppointmentResponse> =>
    fetchAPI('/payments/create-appointment/', { method: 'POST', body: JSON.stringify(data), token }),

  stripeCheckout: (appointmentSid: string, token: string, saveCard?: boolean): Promise<StripeCheckoutResponse> =>
    fetchAPI('/payments/stripe/checkout/', { method: 'POST', body: JSON.stringify({ appointment_sid: appointmentSid, save_card: saveCard || false }), token }),

  stripeSavedCardPay: (appointmentSid: string, paymentMethodId: string, token: string) =>
    fetchAPI('/payments/stripe/saved-card/', { method: 'POST', body: JSON.stringify({ appointment_sid: appointmentSid, payment_method_id: paymentMethodId }), token }),

  stripeVerify: (appointmentSid: string, sessionId: string, token: string) =>
    fetchAPI('/payments/stripe/verify/', { method: 'POST', body: JSON.stringify({ appointment_sid: appointmentSid, session_id: sessionId }), token }),

  paypalCreateOrder: (appointmentSid: string, token: string): Promise<PayPalOrderResponse> =>
    fetchAPI('/payments/paypal/create-order/', { method: 'POST', body: JSON.stringify({ appointment_sid: appointmentSid }), token }),

  paypalCaptureOrder: (data: { payment_id: string; payer_id: string; appointment_sid: string }, token: string) =>
    fetchAPI('/payments/paypal/capture-order/', { method: 'POST', body: JSON.stringify(data), token }),

  cancelPending: (appointmentSid: string, token: string) =>
    fetchAPI('/payments/cancel/', { method: 'POST', body: JSON.stringify({ appointment_sid: appointmentSid }), token }),
};

export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}

export interface SetupIntentResponse {
  client_secret: string;
  setup_intent_id: string;
}

export const paymentMethods = {
  listCards: (token: string): Promise<SavedCard[]> =>
    fetchAPI('/payment-methods/cards/', { token }),

  setupCard: (token: string): Promise<SetupIntentResponse> =>
    fetchAPI('/payment-methods/setup/', { method: 'POST', token }),

  deleteCard: (paymentMethodId: string, token: string) =>
    fetchAPI(`/payment-methods/cards/${paymentMethodId}/`, { method: 'DELETE', token }),

  setDefault: (paymentMethodId: string, token: string) =>
    fetchAPI('/payment-methods/default/', { method: 'POST', body: JSON.stringify({ payment_method_id: paymentMethodId }), token }),
};