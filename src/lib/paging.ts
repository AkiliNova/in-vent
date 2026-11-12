import { api } from "@/lib/api";

/** Laravel's LengthAwarePaginator JSON. */
export interface Page<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

/** The server caps per_page at this (ClampPerPage). */
export const MAX_PER_PAGE = 100;

/**
 * Every row of a paginated endpoint, for dropdowns and pickers that need the
 * full set. Walks pages of 100 so nothing is silently cut off; stops at
 * maxPages as a safety net.
 */
export async function fetchAll<T>(path: string, maxPages = 50): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  const first = await api.get<Page<T>>(`${path}${sep}per_page=${MAX_PER_PAGE}&page=1`);
  const rows = [...first.data];
  const last = Math.min(first.last_page ?? 1, maxPages);

  // Remaining pages in parallel: a few hundred events/organisers is 2–5 requests.
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, last - 1) }, (_, i) => api.get<Page<T>>(`${path}${sep}per_page=${MAX_PER_PAGE}&page=${i + 2}`)),
  );
  rest.forEach((p) => rows.push(...p.data));
  return rows;
}

/** Slice an in-memory list (for lists filtered client-side). */
export function paginate<T>(rows: T[], page: number, perPage: number): Page<T> {
  const last = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(Math.max(1, page), last);
  const start = (current - 1) * perPage;
  const data = rows.slice(start, start + perPage);
  return { data, current_page: current, last_page: last, per_page: perPage, total: rows.length, from: data.length ? start + 1 : null, to: data.length ? start + data.length : null };
}
