export type BackendConnection = {
  id: string;
  name: string;
  baseUrl: string;
  allowInsecureTls: boolean;
};

const CONNECTIONS_KEY = "ai_gateway_connections";
const ACTIVE_CONNECTION_KEY = "ai_gateway_active_connection";
const LAST_EMAIL_KEY = "ai_gateway_last_email";

export function getDefaultConnection(): BackendConnection {
  return {
    id: process.env.NEXT_PUBLIC_DEFAULT_BACKEND_ID || "local-docker",
    name: process.env.NEXT_PUBLIC_DEFAULT_BACKEND_NAME || "Local Docker Backend",
    baseUrl: process.env.NEXT_PUBLIC_DEFAULT_BACKEND_URL || "http://api:18437",
    allowInsecureTls: process.env.NEXT_PUBLIC_DEFAULT_BACKEND_INSECURE_TLS === "true",
  };
}

export function loadConnections(): BackendConnection[] {
  if (typeof window === "undefined") {
    return [getDefaultConnection()];
  }

  try {
    const raw = window.localStorage.getItem(CONNECTIONS_KEY);
    if (!raw) {
      const defaults = [getDefaultConnection()];
      saveConnections(defaults);
      return defaults;
    }
    const parsed = JSON.parse(raw) as BackendConnection[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const defaults = [getDefaultConnection()];
      saveConnections(defaults);
      return defaults;
    }
    return parsed;
  } catch {
    const defaults = [getDefaultConnection()];
    saveConnections(defaults);
    return defaults;
  }
}

export function saveConnections(items: BackendConnection[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(items));
}

export function getActiveConnection(): BackendConnection {
  const defaults = loadConnections();
  if (typeof window === "undefined") {
    return defaults[0];
  }

  const activeId = window.localStorage.getItem(ACTIVE_CONNECTION_KEY);
  const match = defaults.find((item) => item.id === activeId);
  if (match) {
    return match;
  }

  window.localStorage.setItem(ACTIVE_CONNECTION_KEY, defaults[0].id);
  return defaults[0];
}

export function setActiveConnection(id: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ACTIVE_CONNECTION_KEY, id);
}

export function upsertConnection(connection: BackendConnection) {
  const items = loadConnections();
  const index = items.findIndex((item) => item.id === connection.id);
  const nextItems = [...items];
  if (index >= 0) {
    nextItems[index] = connection;
  } else {
    nextItems.push(connection);
  }
  saveConnections(nextItems);
}

export function removeConnection(id: string) {
  const remaining = loadConnections().filter((item) => item.id !== id);
  const nextItems = remaining.length > 0 ? remaining : [getDefaultConnection()];
  saveConnections(nextItems);

  const active = getActiveConnection();
  if (active.id === id) {
    setActiveConnection(nextItems[0].id);
  }
}

export function getLastEmail(): string {
  if (typeof window === "undefined") {
    return "admin@example.com";
  }
  return window.localStorage.getItem(LAST_EMAIL_KEY) || "admin@example.com";
}

export function setLastEmail(email: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LAST_EMAIL_KEY, email);
}
