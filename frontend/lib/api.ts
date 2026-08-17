import type {
  BatchSummary,
  CalibrationPreset,
  CaseOptions,
  DashboardData,
  DecisionMode,
  EditHistoryEntry,
  PdCase,
  PointsResponse,
  ReviewStatus,
  ThresholdSettings,
  TrainingStats,
  UsageEntry,
} from './types';

/**
 * Empty by default: requests go to the current origin and are proxied to the
 * API by the rewrite in next.config.mjs. That keeps one build working on
 * localhost, a LAN address and a public tunnel URL alike. Set
 * NEXT_PUBLIC_API_URL only to bypass the proxy and call the API directly.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

const TOKEN_KEY = 'pdinsight_token';
const USER_KEY = 'pdinsight_user';

export interface SessionUser {
  username: string;
  role: string;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: SessionUser) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);

  // Let the browser set the multipart boundary itself.
  if (!(init.body instanceof FormData) && init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}/api/v1${path}`, { ...init, headers });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === 'string') detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: any) => d.msg).join(', ');
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(res.status, detail);
  }

  return (await res.json()) as T;
}

/** Absolute URL for an image path returned by the API. */
export function fileUrl(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : `${API_BASE}${path}`;
}

async function download(path: string, fallbackName: string) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, `Export failed (${res.status})`);

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = match?.[1] ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const api = {
  // ---- auth ----
  login: (username: string, password: string) =>
    request<{ access_token: string; username: string; role: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  signup: (username: string, password: string, role: string) =>
    request<{ access_token: string; username: string; role: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, password, role }),
    }),

  me: () => request<SessionUser>('/auth/me'),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  roles: () => request<{ roles: string[] }>('/auth/roles'),

  // ---- reference data ----
  options: () => request<CaseOptions>('/cases/options'),
  dashboard: () => request<DashboardData>('/dashboard'),

  // ---- cases ----
  listCases: (params: { batch_id?: number; defect_name?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.batch_id != null) q.set('batch_id', String(params.batch_id));
    if (params.defect_name) q.set('defect_name', params.defect_name);
    const qs = q.toString();
    return request<PdCase[]>(`/cases${qs ? `?${qs}` : ''}`);
  },

  getCase: (id: number) => request<PdCase>(`/cases/${id}`),
  getPoints: (id: number) => request<PointsResponse>(`/cases/${id}/points`),

  uploadCase: (form: FormData) =>
    request<PdCase>('/cases/upload', { method: 'POST', body: form }),

  analyze: (id: number, decisionMode?: DecisionMode, confirmWarning = false) =>
    request<PdCase>(`/cases/${id}/analyze`, {
      method: 'POST',
      body: JSON.stringify({
        decision_mode: decisionMode ?? null,
        confirm_input_warning: confirmWarning,
      }),
    }),

  setDecisionMode: (id: number, mode: DecisionMode) =>
    request<PdCase>(`/cases/${id}/decision-mode`, {
      method: 'POST',
      body: JSON.stringify({ decision_mode: mode }),
    }),

  confirmPdSource: (id: number, value: string) =>
    request<PdCase>(`/cases/${id}/pd-source`, {
      method: 'POST',
      body: JSON.stringify({ confirmed_pd_source_type: value }),
    }),

  updateCalibration: (
    id: number,
    payload: {
      x_left_0deg: number;
      x_right_360deg: number;
      y_top_plot: number;
      y_bottom_plot: number;
      calibration_source?: string;
      calibration_mode?: string;
    },
  ) => request<PdCase>(`/cases/${id}/calibration`, { method: 'PUT', body: JSON.stringify(payload) }),

  autoDetectCalibration: (id: number) =>
    request<PdCase>(`/cases/${id}/calibration/auto-detect`, { method: 'POST' }),

  applyPreset: (id: number, presetId: number) =>
    request<PdCase>(`/cases/${id}/calibration/apply-preset/${presetId}`, { method: 'POST' }),

  resetCalibration: (id: number) =>
    request<PdCase>(`/cases/${id}/calibration/reset`, { method: 'POST' }),

  matchingPreset: (id: number) =>
    request<{ preset: CalibrationPreset | null }>(`/cases/${id}/calibration/matching-preset`),

  updateGap: (id: number, left: number, right: number) =>
    request<PdCase>(`/cases/${id}/gap`, {
      method: 'PUT',
      body: JSON.stringify({ left_line_pixel: left, right_line_pixel: right }),
    }),

  detectGap: (id: number, method: 'rule' | 'model' | 'auto') =>
    request<PdCase>(`/cases/${id}/gap/detect`, {
      method: 'POST',
      body: JSON.stringify({ method }),
    }),

  validateGap: (id: number) =>
    request<{ valid: boolean; message: string }>(`/cases/${id}/gap/validate`),

  saveReview: (
    id: number,
    payload: {
      review_status: ReviewStatus;
      review_note?: string;
      not_measurable_reason?: string;
      confirmed_pd_source_type?: string;
      remark?: string;
    },
  ) => request<PdCase>(`/cases/${id}/review`, { method: 'POST', body: JSON.stringify(payload) }),

  deleteCase: (id: number) => request<void>(`/cases/${id}`, { method: 'DELETE' }),

  // ---- batches ----
  listBatches: () => request<BatchSummary[]>('/batches'),
  getBatch: (id: number) => request<BatchSummary>(`/batches/${id}`),
  deleteBatch: (id: number) => request<void>(`/batches/${id}`, { method: 'DELETE' }),

  createBatch: (name: string) => {
    const form = new FormData();
    form.set('name', name);
    return request<BatchSummary>('/batches', { method: 'POST', body: form });
  },

  uploadFolder: (batchId: number, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return request<{
      created: PdCase[];
      rejected: { filename: string; reason: string }[];
      batch: BatchSummary;
    }>(`/batches/${batchId}/upload`, { method: 'POST', body: form });
  },

  // ---- presets ----
  listPresets: () => request<CalibrationPreset[]>('/presets'),
  createPreset: (payload: Omit<CalibrationPreset, 'id' | 'saved_time'>) =>
    request<CalibrationPreset>('/presets', { method: 'POST', body: JSON.stringify(payload) }),
  deletePreset: (id: number) => request<void>(`/presets/${id}`, { method: 'DELETE' }),

  // ---- per-account thresholds ----
  getThresholds: () => request<ThresholdSettings>('/settings/thresholds'),
  saveThresholds: (values: Partial<Record<string, number | null>>) =>
    request<ThresholdSettings>('/settings/thresholds', {
      method: 'PUT',
      body: JSON.stringify(values),
    }),
  resetThresholds: () =>
    request<ThresholdSettings>('/settings/thresholds', { method: 'DELETE' }),

  // ---- logs ----
  usageLog: (limit = 50) => request<UsageEntry[]>(`/usage-log?limit=${limit}`),
  editHistory: (caseId?: number) =>
    request<EditHistoryEntry[]>(`/edit-history${caseId ? `?case_id=${caseId}` : ''}`),
  trainingStats: () => request<TrainingStats>('/training/stats'),
  exportCounts: () =>
    request<{ reviewed_cases: number; all_cases: number; edit_history_entries: number }>(
      '/export/counts',
    ),

  // ---- exports ----
  exportMaster: (includePending = false) =>
    download(`/export/master?include_pending=${includePending}`, 'final_summary.csv'),
  exportPrototypeWorkbook: () =>
    download('/export/prototype-workbook', 'master_workbook.csv'),
  exportSummary: () => download('/export/summary', 'final_summary_short.csv'),
  exportEditHistory: () => download('/export/edit-history', 'edit_history.csv'),
};
