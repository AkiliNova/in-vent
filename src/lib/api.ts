// Thin client for the Laravel API on sendtrack. Replaces the Firebase SDK:
// the browser never talks to the database or holds a provider secret.

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

const TOKEN_KEY = "tikooh_token";

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string) => {
    try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ }
  },
  clear: () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
  },
};

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]>;
  data: any;

  constructor(status: number, message: string, errors: Record<string, string[]> = {}, data: any = null) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.data = data;
  }

  /** First field error, else the message — what a toast should show. */
  get friendly(): string {
    const first = Object.values(this.errors)[0]?.[0];
    return first || this.message;
  }
}

type Body = Record<string, unknown> | FormData | undefined;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/${path.replace(/^\//, "")}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && token) {
      tokenStore.clear();
      window.dispatchEvent(new Event("tikooh:logout"));
    }
    throw new ApiError(res.status, data.message || `Request failed (${res.status})`, data.errors || {}, data);
  }

  return data as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>("GET", path),
  post: <T = any>(path: string, body?: Body) => request<T>("POST", path, body),
  put: <T = any>(path: string, body?: Body) => request<T>("PUT", path, body),
  delete: <T = any>(path: string) => request<T>("DELETE", path),
};

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.friendly : e instanceof Error ? e.message : "Something went wrong.";

export const kes = (n: number | string | null | undefined) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;

/** Upcoming published events, flattened for cards on the public pages. */
export async function fetchPublicEvents(params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ per_page: "50", ...params }).toString();
  const res = await api.get<{ data: EventItem[] }>(`public/events?${qs}`);
  return res.data.map((e) => {
    const prices = (e.ticket_tiers || []).filter((t) => t.is_active).map((t) => Number(t.price));
    return {
      id: e.uuid,
      title: e.title,
      price: prices.length ? Math.min(...prices) : 0,
      image: e.cover_url || "",
      images: e.cover_url ? [e.cover_url] : [],
      startDate: e.start_date,
      location: [e.location_name, e.city].filter(Boolean).join(", "),
      city: e.city || "",
      eventType: e.event_type || "",
      link: `/e/${e.uuid}`,
      isPast: new Date(e.start_date) < new Date(),
    };
  });
}

// ── Shapes returned by the API ──────────────────────────────────────────────

export interface TicketTier {
  id: number;
  uuid: string;
  name: string;
  description?: string | null;
  price: string | number;
  capacity: number;
  sold: number;
  reserved?: number;
  is_active: boolean;
  is_hidden?: boolean;
  max_per_order?: number;
  min_per_order?: number;
  sales_start_at?: string | null;
  sales_end_at?: string | null;
}

export interface EventItem {
  id: number;
  uuid: string;
  title: string;
  slug: string;
  description?: string | null;
  host?: string | null;
  event_type?: string | null;
  start_date: string;
  end_date?: string | null;
  location_name?: string | null;
  city?: string | null;
  location_map_link?: string | null;
  status: "draft" | "published" | "live" | "ended" | "archived";
  is_public: boolean;
  cover_url?: string | null;
  currency: string;
  ticket_tiers?: TicketTier[];
  attendees_count?: number;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: "super_admin" | "organizer" | "staff" | "exhibitor" | "attendee";
  phone?: string | null;
  tenant: { uuid: string; organization_name: string; slug: string; package: string } | null;
}
