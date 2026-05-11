import { getActiveConnection } from "./connections";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/proxy";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export function getToken() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem("ai_gateway_token") || "";
}

export function setToken(token: string) {
  window.localStorage.setItem("ai_gateway_token", token);
}

export function clearToken() {
  window.localStorage.removeItem("ai_gateway_token");
}

export async function apiRequest<T>(path: string, method: HttpMethod = "GET", body?: unknown, token = getToken()): Promise<T> {
  const connection = typeof window === "undefined" ? null : getActiveConnection();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(connection ? { "x-ai-gateway-target": connection.baseUrl } : {}),
        ...(connection ? { "x-ai-gateway-insecure-tls": String(connection.allowInsecureTls) } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new Error("Cannot reach API gateway. Check whether the backend service is running.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error || "request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  return apiRequest<{ token: string; user: { id: string; email: string; role: string } }>("/api/auth/login", "POST", { email, password }, "");
}

export async function currentUser() {
  return apiRequest<{ user: { id: string; email: string; role: string } }>("/api/auth/me", "GET");
}

export async function probeConnection() {
 return apiRequest<{ status: string; service: string }>("/health", "GET", undefined, "");
}

export function withAdminPath(path: string) {
  return `/api/admin${path}`;
}
