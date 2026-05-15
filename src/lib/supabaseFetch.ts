/**
 * Direct Supabase REST fetch helper — bypasses supabase-js client
 * which can hang on session refresh. Reads the auth token directly
 * from localStorage, same approach proven to work in CSV import.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export function getAuthToken(): string | null {
  try {
    const key = Object.keys(localStorage).find((k) => k.includes('auth-token'));
    if (!key) return null;
    return JSON.parse(localStorage.getItem(key) || '{}')?.access_token ?? null;
  } catch {
    return null;
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

type FilterParam = Record<string, string | number | boolean | null>;

export async function sbSelect<T>(
  table: string,
  {
    select = '*',
    filters = {},
    order,
    limit,
  }: {
    select?: string;
    filters?: FilterParam;
    order?: { column: string; ascending?: boolean; nullsFirst?: boolean };
    limit?: number;
  } = {}
): Promise<T[]> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const params = new URLSearchParams({ select });
  for (const [k, v] of Object.entries(filters)) {
    if (v === null) params.append(k, 'is.null');
    else params.append(k, `eq.${v}`);
  }
  if (order) {
    const dir = order.ascending ? 'asc' : 'desc';
    const nulls = order.nullsFirst === false ? '.nullslast' : order.nullsFirst ? '.nullsfirst' : '';
    params.append('order', `${order.column}.${dir}${nulls}`);
  }
  if (limit) params.append('limit', String(limit));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: authHeaders(token),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[sbSelect ${table}] ${res.status}: ${err}`);
  }
  return res.json() as Promise<T[]>;
}

export async function sbInsert(
  table: string,
  rows: Record<string, unknown>[],
  { onConflict, upsert = false }: { onConflict?: string; upsert?: boolean } = {}
): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  // Build columns param from union of all keys
  const allKeys = [...new Set(rows.flatMap(Object.keys))];
  const columnsParam = allKeys.map((k) => `"${k}"`).join(',');

  const params = new URLSearchParams({ columns: columnsParam });
  if (upsert && onConflict) params.append('on_conflict', onConflict);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      Prefer: upsert ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[sbInsert ${table}] ${res.status}: ${err}`);
  }
}

export async function sbSelectSingle<T>(
  table: string,
  filters: FilterParam
): Promise<T | null> {
  const rows = await sbSelect<T>(table, { filters, limit: 1 });
  return rows[0] ?? null;
}
