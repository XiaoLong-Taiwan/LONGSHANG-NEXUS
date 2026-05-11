import { useRouter } from "next/router";
import { FormEvent, useEffect, useState } from "react";

import { login, probeConnection, setToken } from "../lib/api";
import { type BackendConnection, getActiveConnection, getLastEmail, loadConnections, setActiveConnection, setLastEmail, upsertConnection } from "../lib/connections";

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123456");
  const [connections, setConnections] = useState<BackendConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState("");
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [connectionForm, setConnectionForm] = useState<BackendConnection>({
    id: "",
    name: "",
    baseUrl: "http://localhost:18437",
    allowInsecureTls: false,
  });
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("Not checked");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (typeof router.query.token === "string") {
      setToken(router.query.token);
      router.replace("/dashboard");
      return;
    }
    const items = loadConnections();
    const active = getActiveConnection();
    setConnections(items);
    setActiveConnectionId(active.id);
    setEmail(getLastEmail());
    if (typeof router.query.error === "string") {
      if (router.query.error === "admin") {
        setError("This account does not have admin console access.");
      } else if (router.query.error === "session") {
        setError("Your previous session is no longer valid. Please sign in again.");
      }
    }
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      setLastEmail(email);
      const result = await login(email, password);
      if (result.user.role !== "admin") {
        setError("This account can sign in, but it does not have admin console access.");
        return;
      }
      setToken(result.token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckConnection() {
    setChecking(true);
    setConnectionStatus("Checking...");
    try {
      const result = await probeConnection();
      setConnectionStatus(`Connected: ${result.service}`);
    } catch (err) {
      setConnectionStatus(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setChecking(false);
    }
  }

  function handleSaveConnection(event: FormEvent) {
    event.preventDefault();
    const connection = {
      ...connectionForm,
      id: connectionForm.id || slugify(connectionForm.name || connectionForm.baseUrl),
    };
    upsertConnection(connection);
    const items = loadConnections();
    setConnections(items);
    setActiveConnection(connection.id);
    setActiveConnectionId(connection.id);
    setConnectionStatus(`Saved backend: ${connection.name}`);
    setShowConnectionForm(false);
    setConnectionForm({
      id: "",
      name: "",
      baseUrl: "http://localhost:18437",
      allowInsecureTls: false,
    });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center gap-8 px-4 py-10 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
      <section className="space-y-6">
        <span className="inline-flex rounded-full bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 shadow-sm">
          OpenAI-compatible AI Gateway
        </span>
        <h1 className="max-w-3xl text-5xl font-semibold leading-tight text-slate-950 md:text-6xl">
          One API surface for <span className="text-accent">OpenAI</span>, <span className="text-sea">Gemini</span>, and <span className="text-leaf">Claude</span>.
        </h1>
        <p className="max-w-2xl text-lg text-slate-600">
          The gateway normalizes chat, embeddings, images, API key policy, provider rotation, proxy routing, and monitoring into a single OpenAI SDK-compatible control plane.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            "Clear frontend/backend split",
            "Multi-backend control plane",
            "Optional HTTPS on both sides",
          ].map((item) => (
            <div key={item} className="panel p-5 text-sm font-medium text-slate-700">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-8">
        <div className="mb-6">
          <p className="text-sm font-medium text-slate-500">Admin sign-in</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">Gateway Console</h2>
          <p className="mt-2 text-sm text-slate-500">
            Choose a backend connection, verify reachability, then sign in with the admin or user account for that specific gateway node.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <select
            className="field"
            value={activeConnectionId}
            onChange={(event) => {
              setActiveConnectionId(event.target.value);
              setActiveConnection(event.target.value);
              const active = loadConnections().find((item) => item.id === event.target.value);
              setConnectionStatus(active ? `Selected: ${active.name}` : "Not checked");
            }}
          >
            {connections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} - {item.baseUrl}
              </option>
            ))}
          </select>
          <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
          <input className="field" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <button className="btn-secondary w-full" disabled={checking} onClick={handleCheckConnection} type="button">
              {checking ? "Checking..." : "Test backend"}
            </button>
            <button className="btn-primary w-full" disabled={loading} type="submit">
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>
        <div className="mt-4">
          <button className="btn-secondary w-full" onClick={() => setShowConnectionForm((value) => !value)} type="button">
            {showConnectionForm ? "Hide backend form" : "Add another backend"}
          </button>
        </div>
        {showConnectionForm ? (
          <form className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4" onSubmit={handleSaveConnection}>
            <input className="field" placeholder="Backend name" value={connectionForm.name} onChange={(event) => setConnectionForm({ ...connectionForm, name: event.target.value })} />
            <input className="field" placeholder="Backend base URL" value={connectionForm.baseUrl} onChange={(event) => setConnectionForm({ ...connectionForm, baseUrl: event.target.value })} />
            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={connectionForm.allowInsecureTls} onChange={(event) => setConnectionForm({ ...connectionForm, allowInsecureTls: event.target.checked })} />
              Allow self-signed HTTPS
            </label>
            <button className="btn-primary" type="submit">Save backend</button>
          </form>
        ) : null}
        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          <p>
            Default development account: <span className="font-semibold text-slate-900">admin@example.com</span>
          </p>
          <p className="mt-2">Connection status: <span className="font-semibold text-slate-900">{connectionStatus}</span></p>
          <p className="mt-2">
            Need another backend? After login, open the <span className="font-semibold text-slate-900">Connections</span> page to add or switch nodes.
          </p>
        </div>
      </section>
    </div>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "connection";
}
