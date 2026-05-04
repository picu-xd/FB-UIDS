import AsyncStorage from "@react-native-async-storage/async-storage";

const RAW = process.env.EXPO_PUBLIC_BACKEND_URL || "";
export const API_BASE = RAW.replace(/\/$/, "") + "/api";

const TOKEN_KEY = "fbchecker.token";

export async function setToken(token: string | null) {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

type ReqOpts = {
  method?: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  body?: any;
  auth?: boolean; // default true
  query?: Record<string, string | number | undefined | null>;
};

export async function api<T = any>(path: string, opts: ReqOpts = {}): Promise<T> {
  const { method = "GET", body, auth = true, query } = opts;
  let url = `${API_BASE}${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = data?.detail || data?.message || `Request failed (${res.status})`;
    const err = new Error(formatErrorDetail(detail));
    (err as any).status = res.status;
    (err as any).body = data;
    throw err;
  }
  return data as T;
}

export function formatErrorDetail(detail: any): string {
  if (detail == null) return "Something went wrong";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" • ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

// ---------- Endpoints ----------
export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string | null;
};

export type Account = {
  id: string;
  identifier: string;
  password: string;
  type: "uid" | "email";
  status: "pending" | "valid" | "invalid" | "checking";
  note: string;
  created_at: string | null;
  checked_at: string | null;
};

export type Stats = {
  total: number;
  by_status: { pending: number; valid: number; invalid: number; checking: number };
  by_type: { uid: number; email: number };
  recent_activity: { type: string; result: string; ts: string }[];
};

export const Auth = {
  register: (email: string, password: string, name: string) =>
    api<{ access_token: string; user: User }>("/auth/register", {
      method: "POST",
      auth: false,
      body: { email, password, name },
    }),
  login: (email: string, password: string) =>
    api<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    }),
  me: () => api<User>("/auth/me"),
  logout: () => api("/auth/logout", { method: "POST" }),
};

export const Accounts = {
  parse: (text: string) =>
    api<{ count: number; accounts: { identifier: string; password: string; type: "uid" | "email" }[] }>(
      "/accounts/parse",
      { method: "POST", body: { text } },
    ),
  bulk: (accounts: { identifier: string; password: string; type: "uid" | "email" }[]) =>
    api<{ inserted: number; duplicates: number; accounts: Account[] }>("/accounts/bulk", {
      method: "POST",
      body: { accounts },
    }),
  list: (status?: string) =>
    api<{ count: number; accounts: Account[] }>("/accounts", { query: { status } }),
  delete: (id: string) => api(`/accounts/${id}`, { method: "DELETE" }),
  bulkDelete: (ids: string[]) =>
    api<{ deleted: number }>("/accounts/bulk-delete", {
      method: "POST",
      body: { account_ids: ids },
    }),
  check: (ids: string[]) =>
    api<{ checked: number; valid: number; invalid: number; accounts: Account[] }>("/accounts/check", {
      method: "POST",
      body: { account_ids: ids },
    }),
};

export const Insights = {
  stats: () => api<Stats>("/stats"),
};
