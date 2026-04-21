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
  average_rating: string;
  total_reviews: number;
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
  /** `null` when available. One of `'past' | 'break' | 'shift_end' | 'booked'` when not. */
  unavailable_reason: 'past' | 'break' | 'shift_end' | 'booked' | null;
}

export interface ScheduleBlock {
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
}

export interface SlotSummary {
  total_slots: number;
  booked_slots: number;
  available_slots: number;
  break_slots: number;
  occupancy_percent: number;
}

export interface DayInfo {
  date: string;
  total_slots: number;
  booked_slots: number;
  available_slots: number;
  occupancy_percent: number;
}

export interface DayAvailability {
  date: string;
  schedules: ScheduleBlock[];
  slots: TimeSlot[];
  summary: SlotSummary;
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
  doctor_sid: string | null;
  service_name: string | null;
  service_sid: string | null;
  service_cost: string;
  service_duration: number;
  branch_name: string | null;
  meeting_link: string;
  meeting_provider: string;
  issues: string;
  symptoms: string;
  notes: string;
  invoice_status: string | null;
  cancelled_at: string | null;
  cancelled_by: string;
  cancel_reason: string;
  rescheduled_from: string | null;
  reschedule_count: number;
  created_at: string;
}

export interface CancelAppointmentResponse {
  detail: string;
  refund_amount: string;
  refund_status?: string;
}

export interface RescheduleAppointmentResponse {
  detail: string;
  new_date: string;
  reschedule_count: number;
}

/**
 * Bookable target for day/slot queries. Every caller must pass either a
 * serviceSid (consultation) or a labTestSid (direct lab booking).
 */
type BookableQuery =
  | { serviceSid: string; labTestSid?: undefined }
  | { serviceSid?: undefined; labTestSid: string };

function bookableQueryString(q: BookableQuery): string {
  return q.serviceSid ? `service_sid=${q.serviceSid}` : `lab_test_sid=${q.labTestSid}`;
}

export const doctors = {
  schedule: (sid: string): Promise<DoctorScheduleEntry[]> =>
    fetchAPI(`/doctors/${sid}/schedule/`),

  availableDays: (sid: string, month: string, q: BookableQuery): Promise<DayInfo[]> =>
    fetchAPI(`/doctors/${sid}/available-days/?month=${month}&${bookableQueryString(q)}`),

  availableSlots: (
    sid: string,
    date: string,
    q: BookableQuery,
    init?: { signal?: AbortSignal },
  ): Promise<DayAvailability> =>
    fetchAPI(`/doctors/${sid}/available-slots/?date=${date}&${bookableQueryString(q)}`, {
      signal: init?.signal,
    }),
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
  meeting_link: string;
  meeting_provider: string;
  doctor_sid: string | null;
  service_sid: string | null;
  invoice_status: string | null;
  cancelled_at: string | null;
  cancelled_by: string;
  cancel_reason: string;
  rescheduled_from: string | null;
  reschedule_count: number;
}

export const appointments = {
  create: (data: AppointmentCreateData, token: string): Promise<AppointmentItem> =>
    fetchAPI('/appointments/', { method: 'POST', body: JSON.stringify(data), token }),

  list: (token: string, init?: { signal?: AbortSignal }): Promise<AppointmentItem[]> =>
    fetchAPI('/appointments/my/', { token, signal: init?.signal }),

  cancel: (sid: string, reason: string, token: string): Promise<CancelAppointmentResponse> =>
    fetchAPI(`/appointments/${sid}/cancel/`, { method: 'POST', body: JSON.stringify({ reason }), token }),

  reschedule: (sid: string, date: string, token: string): Promise<RescheduleAppointmentResponse> =>
    fetchAPI(`/appointments/${sid}/reschedule/`, { method: 'POST', body: JSON.stringify({ date }), token }),

  delete: (sid: string, token: string) =>
    fetchAPI(`/appointments/${sid}/delete/`, { method: 'DELETE', token }),

  doctorList: (token: string, date?: string): Promise<DoctorAppointmentItem[]> =>
    fetchAPI(`/appointments/doctor/${date ? `?date=${date}` : ''}`, { token }),

  doctorListByMonth: (token: string, month: string): Promise<DoctorAppointmentItem[]> =>
    fetchAPI(`/appointments/doctor/?month=${month}`, { token }),

  doctorDetail: (sid: string, token: string): Promise<DoctorAppointmentDetail> =>
    fetchAPI(`/appointments/doctor/${sid}/`, { token }),

  doctorCancel: (sid: string, reason: string, token: string): Promise<CancelAppointmentResponse> =>
    fetchAPI(`/appointments/doctor/${sid}/cancel/`, { method: 'POST', body: JSON.stringify({ reason }), token }),

  doctorReschedule: (sid: string, date: string, token: string): Promise<RescheduleAppointmentResponse> =>
    fetchAPI(`/appointments/doctor/${sid}/reschedule/`, { method: 'POST', body: JSON.stringify({ date }), token }),

  doctorStatus: (
    sid: string,
    newStatus: 'In Progress' | 'Completed' | 'Cancelled' | 'No Show',
    token: string,
    extra?: { meeting_link?: string; meeting_provider?: string },
  ): Promise<{ detail: string; status: string; meeting_link?: string }> =>
    fetchAPI(`/appointments/doctor/${sid}/status/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus, ...extra }),
      token,
    }),

  doctorComplete: (
    sid: string,
    payload: AppointmentCompletePayload,
    token: string,
  ): Promise<AppointmentCompleteResponse> =>
    fetchAPI(`/appointments/doctor/${sid}/complete/`, {
      method: 'POST',
      body: JSON.stringify(payload),
      token,
    }),
};

// ---- Medical workflow types ----

export interface MedicationCatalogItem {
  sid: string;
  name: string;
  generic_name: string;
  category: string;
  dosage_form: string;
  strength: string;
  cost: string;
  requires_prescription: boolean;
  free_when_prescribed: boolean;
  image: string | null;
}

export interface LabTestItem {
  sid: string;
  name: string;
  category: string;
  description: string;
  cost: string;
  image: string | null;
  duration_minutes: number;
  requires_prescription: boolean;
  free_when_prescribed: boolean;
  /**
   * True when the authenticated patient has an unclaimed prescription
   * (`LabOrderItem`) for this lab. Annotated by `LabTestCatalogView`. Always
   * `false` for anonymous requests or non-patients. Used by the UI to render
   * the "Free for you" badge + crossed-out price.
   */
  has_active_prescription?: boolean;
}

/** A staff member listed inside `LabTestDetail.staff`. Same shape as `ServiceDoctor`. */
export interface LabStaffItem {
  sid: string;
  full_name: string;
  first_name: string;
  first_last_name: string;
  image: string | null;
  specialization: string;
  years_of_experience: number;
}

export interface LabTestDetail extends LabTestItem {
  staff: LabStaffItem[];
}

export interface BookLabResponse {
  appointment_sid: string;
  amount: string;
  status: string;
  lab_test_name: string;
  covered_by_prescription: boolean;
}

export interface PrescriptionItemPayload {
  /** Optional catalog pick. If set, the backend links the FK. */
  medication_sid?: string;
  /** Free-text name. Required if `medication_sid` is empty. */
  medication_name?: string;
  dosage: string;
  frequency: string;
  duration_days: number;
  instructions?: string;
}

export interface LabOrderItemPayload {
  test_sid: string;
  notes?: string;
}

export interface AppointmentCompletePayload {
  diagnosis: string;
  treatment_plan?: string;
  notes?: string;
  prescription?: {
    additional_notes?: string;
    items: PrescriptionItemPayload[];
  };
  lab_order?: {
    notes?: string;
    items: LabOrderItemPayload[];
  };
}

export interface AppointmentCompleteResponse {
  detail: string;
  appointment_sid: string;
  medical_record_sid: string;
  prescription_sid: string | null;
  lab_order_sid: string | null;
}

export const medications = {
  list: (token: string, search?: string): Promise<MedicationCatalogItem[]> =>
    fetchAPI(`/medications/${search ? `?search=${encodeURIComponent(search)}` : ''}`, { token }),
};

export const labTests = {
  list: (token: string, search?: string): Promise<LabTestItem[]> =>
    fetchAPI(`/lab-tests/${search ? `?search=${encodeURIComponent(search)}` : ''}`, { token }),
};

/** Public (patient-facing) lab test catalog. */
export const labTestsCatalog = {
  /**
   * Pass `token` so the response includes `has_active_prescription` per item
   * (used by the catalog UI for the "Free for you" badge). Without a token the
   * field comes back as `false` for every item.
   */
  list: (opts?: { search?: string; token?: string }): Promise<LabTestItem[]> =>
    fetchAPI(
      `/lab-tests-catalog/${opts?.search ? `?search=${encodeURIComponent(opts.search)}` : ''}`,
      opts?.token ? { token: opts.token } : {},
    ),

  detail: (sid: string): Promise<LabTestDetail> =>
    fetchAPI(`/lab-tests-catalog/${sid}/`),

  book: (
    payload: { lab_test_sid: string; staff_sid: string; date: string; branch_sid?: string },
    token: string,
  ): Promise<BookLabResponse> =>
    fetchAPI('/lab-tests/book/', {
      method: 'POST',
      body: JSON.stringify(payload),
      token,
    }),
};

export const branches = {
  list: (): Promise<BranchItem[]> =>
    fetchAPI('/branches/'),
};

// ============================================================================
// Patient-side medical workflow: records, prescriptions, labs, medicine shop
// ============================================================================

export interface PatientPrescriptionItem {
  sid: string;
  medication_sid: string | null;
  medication_name: string;
  is_system_medication: boolean;
  medication_info: {
    name: string;
    generic_name: string;
    category: string;
    dosage_form: string;
    strength: string;
    cost: string;
    free_when_prescribed: boolean;
  } | null;
  dosage: string;
  frequency: string;
  duration_days: number;
  instructions: string;
  delivery_method: string;
  delivery_branch: number | null;
  delivery_address: string;
  delivery_status: string;
  is_claimed: boolean;
}

export interface PatientPrescription {
  sid: string;
  additional_notes: string;
  items: PatientPrescriptionItem[];
  created_at: string;
}

export interface PatientLabOrderItem {
  sid: string;
  test_sid: string;
  test_name: string;
  test_category: string;
  notes: string;
  is_claimed: boolean;
  has_result: boolean;
}

export interface PatientLabOrder {
  sid: string;
  status: string;
  is_prescribed: boolean;
  notes: string;
  items: PatientLabOrderItem[];
  ordered_at: string;
}

export interface PatientMedicalRecordListItem {
  sid: string;
  diagnosis: string;
  doctor_name: string | null;
  has_prescription: boolean;
  has_lab_orders: boolean;
  created_at: string;
}

export interface PatientMedicalRecordDetail {
  sid: string;
  diagnosis: string;
  treatment_plan: string;
  notes: string;
  doctor_name: string | null;
  prescription: PatientPrescription | null;
  lab_orders: PatientLabOrder[];
  created_at: string;
}

/**
 * Fetch a PDF endpoint and trigger a browser download. Used for prescription
 * and lab-order PDFs (generated on-demand by the backend). Throws on non-200
 * so callers can show a toast if the download fails.
 */
export async function downloadPdf(endpoint: string, filename: string, token: string): Promise<void> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Language': getLocale(),
    },
  });
  if (!res.ok) {
    throw { status: res.status, data: await res.json().catch(() => null) };
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const patientMedicalRecords = {
  list: (token: string): Promise<PatientMedicalRecordListItem[]> =>
    fetchAPI('/patient/medical-records/', { token }).then(
      (data: { results?: PatientMedicalRecordListItem[] } | PatientMedicalRecordListItem[]) =>
        Array.isArray(data) ? data : (data.results ?? []),
    ),
  detail: (sid: string, token: string): Promise<PatientMedicalRecordDetail> =>
    fetchAPI(`/patient/medical-records/${sid}/`, { token }),
};

export const patientLabOrders = {
  list: (token: string): Promise<PatientLabOrder[]> =>
    fetchAPI('/patient/lab-orders/', { token }).then(
      (data: { results?: PatientLabOrder[] } | PatientLabOrder[]) =>
        Array.isArray(data) ? data : (data.results ?? []),
    ),

  downloadPdf: (sid: string, token: string): Promise<void> =>
    downloadPdf(`/patient/lab-orders/${sid}/pdf/`, `lab-order-${sid.slice(0, 8).toUpperCase()}.pdf`, token),
};

export const patientPrescriptions = {
  downloadPdf: (sid: string, token: string): Promise<void> =>
    downloadPdf(`/patient/prescriptions/${sid}/pdf/`, `prescription-${sid.slice(0, 8).toUpperCase()}.pdf`, token),
};

// ---- Medicine shop (patient purchases) ----

export interface MedicineCatalogItem {
  sid: string;
  name: string;
  generic_name: string;
  description: string;
  image: string | null;
  category: string;
  dosage_form: string;
  strength: string;
  cost: string;
  requires_prescription: boolean;
  free_when_prescribed: boolean;
}

export interface MedicineOrderCreateItem {
  medication_sid: string;
  quantity: number;
}

export interface MedicineOrderCreatePayload {
  items: MedicineOrderCreateItem[];
  delivery_method: 'pickup' | 'delivery';
  branch_sid?: string;
  delivery_address?: string;
  notes?: string;
}

export interface MedicineOrderCreateResponse {
  order_sid: string;
  total: string;
  status: string;
  pickup_code: string | null;
  detail: string;
}

export interface MedicineOrderListItem {
  sid: string;
  status: string;
  delivery_method: string;
  total: string;
  items_count: number;
  pickup_code: string | null;
  created_at: string;
}

export const medicineCatalog = {
  /**
   * By default the backend only returns OTC meds (`requires_prescription=false`).
   * Pass `includePrescription=true` to also receive medications that require
   * a prescription — the UI uses this to render them with a "Rx required" badge
   * so patients know the hospital carries them.
   */
  list: (opts?: { search?: string; includePrescription?: boolean }): Promise<MedicineCatalogItem[]> => {
    const params = new URLSearchParams();
    if (opts?.search) params.set('search', opts.search);
    if (opts?.includePrescription) params.set('include_prescription', 'true');
    const qs = params.toString();
    return fetchAPI(`/medicine-catalog/${qs ? `?${qs}` : ''}`);
  },
};

export interface MedicineOrderDetailItem {
  sid: string;
  medication_name: string;
  medication_strength: string;
  quantity: number;
  unit_price: string;
  total: string;
}

export interface MedicineOrderDetail {
  sid: string;
  status: string;
  delivery_method: string;
  branch_name: string | null;
  delivery_address: string;
  subtotal: string;
  total: string;
  notes: string;
  items: MedicineOrderDetailItem[];
  pickup_code: string | null;
  created_at: string;
}

export const medicineOrders = {
  create: (payload: MedicineOrderCreatePayload, token: string): Promise<MedicineOrderCreateResponse> =>
    fetchAPI('/medicine-orders/', {
      method: 'POST',
      body: JSON.stringify(payload),
      token,
    }),

  list: (token: string): Promise<MedicineOrderListItem[]> =>
    fetchAPI('/medicine-orders/my/', { token }).then(
      (data: { results?: MedicineOrderListItem[] } | MedicineOrderListItem[]) =>
        Array.isArray(data) ? data : (data.results ?? []),
    ),

  detail: (sid: string, token: string): Promise<MedicineOrderDetail> =>
    fetchAPI(`/medicine-orders/${sid}/`, { token }),
};

// ---- Medicine delivery (bundled shipping) ----

export interface PrescriptionDeliveryCreateResponse {
  order_sid: string;
  total: string;
  shipping_fee: string;
  item_count: number;
  origin_branch: string;
  address: string;
}

export interface DeliveryTrackingItem {
  sid: string;
  name: string;
  dosage_form: string;
  strength: string;
  quantity: number;
  unit_price: string;
  total: string;
}

export interface DeliveryTrackingResponse {
  order_sid: string;
  stage: 'picked_up' | 'left_origin' | 'on_the_way' | 'arriving_soon' | 'delivered';
  stage_index: number;
  total_stages: number;
  started_at: string | null;
  delivered_at: string | null;
  origin_branch: string;
  address: string;
  shipping_fee: string;
  total: string;
  items: DeliveryTrackingItem[];
}

export interface DeliveryListItem {
  order_sid: string;
  created_at: string;
  status: string;
  stage: DeliveryTrackingResponse['stage'] | null;
  stage_index: number | null;
  total_stages: number;
  origin_branch: string;
  address: string;
  item_count: number;
  total: string;
  shipping_fee: string;
}

export const medicineDelivery = {
  createFromPrescription: (
    prescriptionSid: string,
    address: string,
    token: string,
  ): Promise<PrescriptionDeliveryCreateResponse> =>
    fetchAPI(`/prescriptions/${prescriptionSid}/delivery/`, {
      method: 'POST',
      body: JSON.stringify({ address }),
      token,
    }),

  tracking: (orderSid: string, token: string): Promise<DeliveryTrackingResponse> =>
    fetchAPI(`/medicine-orders/${orderSid}/tracking/`, { token }),

  list: (token: string): Promise<DeliveryListItem[]> =>
    fetchAPI('/deliveries/', { token }),
};

// ---- Prescribed lab booking (free appointment) ----

export interface BookPrescribedLabResponse {
  appointment_sid: string;
  detail: string;
}

export const bookPrescribedLab = {
  create: (
    labOrderSid: string,
    dateIso: string,
    branchSid: string,
    token: string,
  ): Promise<BookPrescribedLabResponse> =>
    fetchAPI('/appointments/book-prescribed-lab/', {
      method: 'POST',
      body: JSON.stringify({ lab_order_sid: labOrderSid, date: dateIso, branch_sid: branchSid }),
      token,
    }),
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
// Reviews (doctor ratings)
// ============================================================================

export interface ReviewItem {
  sid: string;
  rating: number;
  comment: string;
  created_at: string;
  patient_name: string;
  patient_image: string | null;
  doctor_sid: string;
  doctor_name: string;
  doctor_image: string | null;
  doctor_specialization: string;
  appointment_sid: string;
  appointment_date: string;
}

export interface PendingReviewAppointment {
  sid: string;
  date: string;
  doctor_sid: string | null;
  doctor_name: string | null;
  doctor_image: string | null;
  doctor_specialization: string | null;
  service_name: string | null;
}

export interface ReviewCreatePayload {
  appointment_sid: string;
  rating: number;
  comment?: string;
}

export const reviews = {
  byDoctor: (doctorSid: string): Promise<ReviewItem[]> =>
    fetchAPI(`/reviews/doctor/${doctorSid}/`),

  mine: (token: string): Promise<ReviewItem[]> =>
    fetchAPI('/reviews/mine/', { token }),

  all: (token: string): Promise<ReviewItem[]> =>
    fetchAPI('/reviews/all/', { token }),

  pending: (token: string): Promise<PendingReviewAppointment[]> =>
    fetchAPI('/reviews/pending/', { token }),

  createOrUpdate: (payload: ReviewCreatePayload, token: string): Promise<ReviewItem> =>
    fetchAPI('/reviews/', { method: 'POST', body: JSON.stringify(payload), token }),

  delete: (sid: string, token: string) =>
    fetchAPI(`/reviews/${sid}/`, { method: 'DELETE', token }),
};

// ============================================================================
// Payment Flow API
// ============================================================================

export interface CreateAppointmentResponse {
  appointment_sid: string;
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

/**
 * Payment flow for a `MedicineOrder`. Mirrors `paymentFlow` (appointments) but
 * hits the medicine-order-specific endpoints. The Stripe webhook is shared —
 * the backend branches on metadata.kind.
 */
export const medicineOrderPaymentFlow = {
  stripeCheckout: (orderSid: string, token: string): Promise<StripeCheckoutResponse> =>
    fetchAPI('/payments/medicine-order/stripe/checkout/', {
      method: 'POST',
      body: JSON.stringify({ order_sid: orderSid }),
      token,
    }),

  stripeVerify: (orderSid: string, sessionId: string, token: string) =>
    fetchAPI('/payments/medicine-order/stripe/verify/', {
      method: 'POST',
      body: JSON.stringify({ order_sid: orderSid, session_id: sessionId }),
      token,
    }),

  stripeSavedCardPay: (orderSid: string, paymentMethodId: string, token: string) =>
    fetchAPI('/payments/medicine-order/stripe/saved-card/', {
      method: 'POST',
      body: JSON.stringify({ order_sid: orderSid, payment_method_id: paymentMethodId }),
      token,
    }),

  paypalCreateOrder: (orderSid: string, token: string): Promise<PayPalOrderResponse> =>
    fetchAPI('/payments/medicine-order/paypal/create-order/', {
      method: 'POST',
      body: JSON.stringify({ order_sid: orderSid }),
      token,
    }),

  paypalCaptureOrder: (
    data: { payment_id: string; payer_id: string; order_sid: string },
    token: string,
  ) =>
    fetchAPI('/payments/medicine-order/paypal/capture-order/', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),
};

/**
 * Discriminated union describing what the `PaymentModal` should charge for.
 * Used to generalise the modal so it can handle both appointment payments
 * (the historic flow) and medicine order payments (added in Paso 4).
 */
export type PaymentTarget =
  | { kind: 'appointment'; appointmentSid: string }
  | { kind: 'medicine_order'; orderSid: string };

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