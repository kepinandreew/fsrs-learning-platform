/**
 * @file api/client.ts
 * @description Klien HTTP terpusat untuk Developer Dashboard dengan penyisipan otomatis token JWT,
 * deduplikasi serta cache GET berdurasi singkat (30 detik), dan pemetaan penuh ke endpoint REST API.
 */
import type {
  AiGenerateResponse,
  AiStatus,
  AiVerifyDeckResponse,
  AnalyticsSummaryResponse,
  AuthResponse,
  ClientApp,
  CreatedAppKeyResponse,
  Deck,
  DeckExportPackage,
  DeveloperProfile,
  DraftFlashcard,
  DraftQuiz,
  FsrsCalibrationResponse,
  FsrsSimulateInitialCard,
  FsrsSimulateResponse,
  FsrsSimulateStepInput,
  ItemType,
  LearningItem,
  MonitoringResponse,
  PaginationMeta,
  PortableDeckItem,
  ShiftDueResponse,
} from './types';

// =============================================================================
// HTTP Client REST API untuk Developer Dashboard
// Otomatis menyisipkan header Authorization: Bearer <JWT> dan memparsing JSON.
// =============================================================================

const DEFAULT_CLOUD_API = 'https://fsrs-learning-platform.vercel.app';
const rawEnvBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE = (
  rawEnvBase ||
  (typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1'
    ? DEFAULT_CLOUD_API
    : '')
).replace(/\/+$/, '');
const TOKEN_STORAGE_KEY = 'lp_dev_jwt_token';

// URL API yang tampil di UI (cURL, badge header): hasil resolusi nyata, bukan hardcode localhost.
export const API_BASE_URL: string =
  API_BASE || (typeof window !== 'undefined' ? window.location.origin : '');

// Cache GET singkat (TTL 30 dtk) + dedup request paralel, agar pindah antar-menu terasa instan.
// Seluruh cache dibuang saat ada mutasi (POST/PATCH/DELETE), ganti token, atau klik "Segarkan".
const GET_CACHE_TTL_MS = 30_000;
const getCache = new Map<string, { at: number; promise: Promise<{ data: unknown; meta?: unknown }> }>();
export const clearApiCache = (): void => getCache.clear();

// Ambil dan simpan token JWT di localStorage.
export const getStoredToken = (): string | null => localStorage.getItem(TOKEN_STORAGE_KEY);
export const setStoredToken = (token: string | null): void => {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
  clearApiCache();
};

// Bentuk standar respons API dari backend Express.js.
interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Fungsi dasar pemanggilan HTTP ke backend (GET di-cache singkat, mutasi membuang cache).
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<{ data: T; meta?: unknown }> {
  const method = (options.method ?? 'GET').toUpperCase();
  if (method !== 'GET') {
    clearApiCache();
    return rawRequest<T>(path, options);
  }

  const key = `${getStoredToken() ?? ''}|${path}`;
  const hit = getCache.get(key);
  if (hit && Date.now() - hit.at < GET_CACHE_TTL_MS) {
    return hit.promise as Promise<{ data: T; meta?: unknown }>;
  }
  const promise = rawRequest<T>(path, options);
  getCache.set(key, { at: Date.now(), promise });
  // Jangan simpan respons gagal agar percobaan berikutnya langsung ke server.
  promise.catch(() => getCache.delete(key));
  return promise;
}

async function rawRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<{ data: T; meta?: unknown }> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);

  // Jangan set Content-Type secara manual apabila body berupa FormData (biarkan browser menambahkan boundary).
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Respons 204 No Content (misal pada DELETE deck/item).
  if (res.status === 204) {
    return { data: undefined as T };
  }

  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !body || !body.success) {
    const message = body?.error?.message ?? `Permintaan gagal (HTTP ${res.status})`;
    throw new Error(message);
  }

  return { data: body.data, meta: body.meta };
}

// =============================================================================
// 1. Modul Auth Developer (/api/auth/developer/...)
// =============================================================================

export const authApi = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const { data } = await request<AuthResponse>('/api/auth/developer/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return data;
  },

  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    const { data } = await request<AuthResponse>('/api/auth/developer/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    return data;
  },

  async me(): Promise<DeveloperProfile> {
    const { data } = await request<DeveloperProfile>('/api/auth/developer/me');
    return data;
  },
};

// =============================================================================
// 2. Modul Manajemen Aplikasi & API Key (/api/apps)
// =============================================================================

export const appsApi = {
  async list(): Promise<ClientApp[]> {
    const { data } = await request<ClientApp[]>('/api/apps');
    return data;
  },

  async create(payload: {
    name: string;
    description?: string;
    requestRetention?: number;
    fsrsParams?: number[] | null;
  }): Promise<CreatedAppKeyResponse> {
    const { data } = await request<CreatedAppKeyResponse>('/api/apps', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data;
  },

  async update(
    appId: string,
    payload: {
      name?: string;
      description?: string | null;
      requestRetention?: number;
      fsrsParams?: number[] | null;
      isActive?: boolean;
    },
  ): Promise<ClientApp> {
    const { data } = await request<ClientApp>(`/api/apps/${appId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return data;
  },

  async rotateKey(appId: string): Promise<CreatedAppKeyResponse> {
    const { data } = await request<CreatedAppKeyResponse>(`/api/apps/${appId}/rotate-key`, {
      method: 'POST',
    });
    return data;
  },

  async revokeKey(appId: string): Promise<ClientApp> {
    const { data } = await request<ClientApp>(`/api/apps/${appId}/revoke`, {
      method: 'POST',
    });
    return data;
  },

  // Hapus permanen aplikasi yang masih kosong (backend menolak bila sudah punya materi/riwayat belajar).
  async remove(appId: string): Promise<void> {
    await request<void>(`/api/apps/${appId}`, { method: 'DELETE' });
  },
};

// =============================================================================
// 3. Modul Manajemen Deck Materi (/api/dashboard/decks)
// =============================================================================

export const decksApi = {
  async list(appId?: string, includeInactive?: boolean): Promise<Deck[]> {
    const qs = new URLSearchParams();
    if (appId) qs.set('appId', appId);
    if (includeInactive) qs.set('includeInactive', 'true');
    const qStr = qs.toString();
    const { data } = await request<Deck[]>(`/api/dashboard/decks${qStr ? `?${qStr}` : ''}`);
    return data;
  },

  async create(payload: { appId: string; title: string; description?: string }): Promise<Deck> {
    const { data } = await request<Deck>('/api/dashboard/decks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data;
  },

  async update(
    deckId: string,
    payload: { title?: string; description?: string | null; isActive?: boolean },
  ): Promise<Deck> {
    const { data } = await request<Deck>(`/api/dashboard/decks/${deckId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return data;
  },

  async remove(deckId: string): Promise<void> {
    await request<void>(`/api/dashboard/decks/${deckId}`, { method: 'DELETE' });
  },

  async exportDeck(deckId: string): Promise<DeckExportPackage> {
    const { data } = await request<DeckExportPackage>(`/api/dashboard/decks/${deckId}/export`);
    return data;
  },

  async importDeck(
    deckId: string,
    items: PortableDeckItem[],
  ): Promise<{ counts: { flashcards: number; quizzes: number; total: number } }> {
    const { data } = await request<{ counts: { flashcards: number; quizzes: number; total: number } }>(
      `/api/dashboard/decks/${deckId}/import`,
      {
        method: 'POST',
        body: JSON.stringify({ items }),
      },
    );
    return data;
  },
};

// =============================================================================
// 4. Modul Manajemen Bank Soal (/api/dashboard/items)
// =============================================================================

export const itemsApi = {
  async list(params: {
    deckId?: string;
    appId?: string;
    type?: ItemType;
    search?: string;
    includeInactive?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: LearningItem[]; meta: PaginationMeta }> {
    const searchParams = new URLSearchParams();
    if (params.deckId) searchParams.set('deckId', params.deckId);
    if (params.appId) searchParams.set('appId', params.appId);
    if (params.type) searchParams.set('type', params.type);
    if (params.search) searchParams.set('search', params.search);
    if (params.includeInactive) searchParams.set('includeInactive', 'true');
    if (params.page) searchParams.set('page', String(params.page));
    if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));

    const { data, meta } = await request<LearningItem[]>(
      `/api/dashboard/items?${searchParams.toString()}`,
    );
    return { items: data, meta: meta as PaginationMeta };
  },

  async createFlashcard(payload: {
    deckId: string;
    front: string;
    back: string;
    tags?: string[];
    imageUrl?: string | null;
    audioUrl?: string | null;
  }): Promise<LearningItem> {
    const { data } = await request<LearningItem>('/api/dashboard/items', {
      method: 'POST',
      body: JSON.stringify({ type: 'FLASHCARD', ...payload }),
    });
    return data;
  },

  async createMultipleChoice(payload: {
    deckId: string;
    question: string;
    choices: string[];
    correctIndex: number;
    explanation?: string | null;
    sourceFlashcardId?: string | null;
    tags?: string[];
    imageUrl?: string | null;
    audioUrl?: string | null;
  }): Promise<LearningItem> {
    const { data } = await request<LearningItem>('/api/dashboard/items', {
      method: 'POST',
      body: JSON.stringify({ type: 'MULTIPLE_CHOICE', ...payload }),
    });
    return data;
  },

  async update(
    itemId: string,
    payload: {
      front?: string;
      back?: string;
      question?: string;
      choices?: string[];
      correctIndex?: number;
      explanation?: string | null;
      sourceFlashcardId?: string | null;
      tags?: string[];
      imageUrl?: string | null;
      audioUrl?: string | null;
      isActive?: boolean;
    },
  ): Promise<LearningItem> {
    const { data } = await request<LearningItem>(`/api/dashboard/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return data;
  },

  async remove(itemId: string): Promise<void> {
    await request<void>(`/api/dashboard/items/${itemId}`, { method: 'DELETE' });
  },
};

// =============================================================================
// 5. Modul AI Content Generator (/api/dashboard/ai)
// =============================================================================

export const aiApi = {
  async status(): Promise<AiStatus> {
    const { data } = await request<AiStatus>('/api/dashboard/ai/status');
    return data;
  },

  // Mendukung pengiriman teks murni maupun multipart/form-data dengan unggahan berkas dokumen.
  async generate(payload: {
    deckId: string;
    text?: string;
    file?: File | null;
    flashcardCount: number;
    includeQuiz: boolean;
    choicesCount: number;
    instructions?: string;
    verifyWithAi?: boolean;
    save: boolean;
  }): Promise<AiGenerateResponse> {
    const form = new FormData();
    form.append('deckId', payload.deckId);
    if (payload.text) form.append('text', payload.text);
    if (payload.file) form.append('document', payload.file);
    form.append('flashcardCount', String(payload.flashcardCount));
    form.append('includeQuiz', String(payload.includeQuiz));
    form.append('choicesCount', String(payload.choicesCount));
    if (payload.instructions) form.append('instructions', payload.instructions);
    if (payload.verifyWithAi !== undefined) form.append('verifyWithAi', String(payload.verifyWithAi));
    form.append('save', String(payload.save));

    const { data } = await request<AiGenerateResponse>('/api/dashboard/ai/generate', {
      method: 'POST',
      body: form,
    });
    return data;
  },

  async verifyDeck(payload: {
    deckId: string;
    autoFix?: boolean;
  }): Promise<AiVerifyDeckResponse> {
    const { data } = await request<AiVerifyDeckResponse>('/api/dashboard/ai/verify-deck', {
      method: 'POST',
      body: JSON.stringify({ deckId: payload.deckId, autoFix: payload.autoFix ?? true }),
    });
    return data;
  },

  async commit(payload: {
    deckId: string;
    flashcards: DraftFlashcard[];
    quizzes: DraftQuiz[];
  }): Promise<{ counts: { flashcards: number; quizzes: number; total: number }; items: LearningItem[] }> {
    const { data } = await request<{
      counts: { flashcards: number; quizzes: number; total: number };
      items: LearningItem[];
    }>('/api/dashboard/ai/commit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data;
  },
};

// =============================================================================
// 6. Modul Monitoring & Learning Analytics (/api/dashboard/analytics)
// =============================================================================

export const analyticsApi = {
  async summary(params: {
    appId?: string;
    deckId?: string;
    externalUserId?: string;
    limit?: number;
  }): Promise<AnalyticsSummaryResponse> {
    const qs = new URLSearchParams();
    if (params.appId) qs.set('appId', params.appId);
    if (params.deckId) qs.set('deckId', params.deckId);
    if (params.externalUserId?.trim()) qs.set('externalUserId', params.externalUserId.trim());
    if (params.limit) qs.set('limit', String(params.limit));

    const { data } = await request<AnalyticsSummaryResponse>(
      `/api/dashboard/analytics/summary?${qs.toString()}`,
    );
    return data;
  },

  async monitoring(params: {
    appId?: string;
    deckId?: string;
    externalUserId?: string;
    limit?: number;
  }): Promise<MonitoringResponse> {
    const qs = new URLSearchParams();
    if (params.appId) qs.set('appId', params.appId);
    if (params.deckId) qs.set('deckId', params.deckId);
    if (params.externalUserId?.trim()) qs.set('externalUserId', params.externalUserId.trim());
    if (params.limit) qs.set('limit', String(params.limit));

    const { data } = await request<MonitoringResponse>(
      `/api/dashboard/analytics/monitoring?${qs.toString()}`,
    );
    return data;
  },

  async calibration(params: {
    appId?: string;
    deckId?: string;
    externalUserId?: string;
  }): Promise<FsrsCalibrationResponse> {
    const qs = new URLSearchParams();
    if (params.appId) qs.set('appId', params.appId);
    if (params.deckId) qs.set('deckId', params.deckId);
    if (params.externalUserId?.trim()) qs.set('externalUserId', params.externalUserId.trim());

    const { data } = await request<FsrsCalibrationResponse>(
      `/api/dashboard/analytics/calibration?${qs.toString()}`,
    );
    return data;
  },

  async simulateFsrs(payload: {
    appId?: string;
    fsrsParams?: number[];
    requestRetention: number;
    initialCard?: FsrsSimulateInitialCard;
    steps: FsrsSimulateStepInput[];
  }): Promise<FsrsSimulateResponse> {
    const { data } = await request<FsrsSimulateResponse>('/api/dashboard/analytics/fsrs-simulate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data;
  },

  async shiftDue(payload: {
    appId?: string;
    deckId?: string;
    externalUserId?: string;
    days: number;
  }): Promise<ShiftDueResponse> {
    const { data } = await request<ShiftDueResponse>('/api/dashboard/analytics/shift-due', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data;
  },

  async deleteUser(params: { appId: string; externalUserId: string }): Promise<void> {
    await request<void>(
      `/api/dashboard/analytics/users/${encodeURIComponent(params.externalUserId)}?appId=${encodeURIComponent(params.appId)}`,
      { method: 'DELETE' },
    );
  },

  async exportCsv(params: { appId?: string; deckId?: string; externalUserId?: string }): Promise<void> {
    const qs = new URLSearchParams();
    if (params.appId) qs.set('appId', params.appId);
    if (params.deckId) qs.set('deckId', params.deckId);
    if (params.externalUserId?.trim()) qs.set('externalUserId', params.externalUserId.trim());

    const token = getStoredToken();
    const res = await fetch(`${API_BASE}/api/dashboard/analytics/export-csv?${qs.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new Error(`Gagal mengunduh CSV (HTTP ${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `laporan-evaluasi-fsrs-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
