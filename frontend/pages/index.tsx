import { useRouter } from "next/router";
import { FormEvent, useEffect, useState } from "react";

import LanguageSwitcher from "../components/LanguageSwitcher";
import { login, probeConnection, setToken } from "../lib/api";
import { type BackendConnection, getActiveConnection, getLastEmail, loadConnections, setActiveConnection, setLastEmail, upsertConnection } from "../lib/connections";
import { useI18n } from "../lib/i18n";

export default function HomePage() {
  const router = useRouter();
  const { t } = useI18n();
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
        setError(t("login.noAdmin"));
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
        setError(t("login.noAdmin"));
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
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex rounded-full bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 shadow-sm">
            {t("login.badge")}
          </span>
          <LanguageSwitcher />
        </div>
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
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">{t("login.title")}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {t("login.subtitle")}
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
          <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("login.email")} />
          <input className="field" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("login.password")} type="password" />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <button className="btn-secondary w-full" disabled={checking} onClick={handleCheckConnection} type="button">
              {checking ? t("login.checking") : t("login.testBackend")}
            </button>
            <button className="btn-primary w-full" disabled={loading} type="submit">
              {loading ? t("login.signingIn") : t("login.signIn")}
            </button>
          </div>
        </form>
        <div className="mt-4">
          <button className="btn-secondary w-full" onClick={() => setShowConnectionForm((value) => !value)} type="button">
            {showConnectionForm ? t("login.hideBackend") : t("login.addBackend")}
          </button>
        </div>
        {showConnectionForm ? (
          <form className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4" onSubmit={handleSaveConnection}>
            <input className="field" placeholder={t("login.backendName")} value={connectionForm.name} onChange={(event) => setConnectionForm({ ...connectionForm, name: event.target.value })} />
            <input className="field" placeholder={t("login.backendBaseUrl")} value={connectionForm.baseUrl} onChange={(event) => setConnectionForm({ ...connectionForm, baseUrl: event.target.value })} />
            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={connectionForm.allowInsecureTls} onChange={(event) => setConnectionForm({ ...connectionForm, allowInsecureTls: event.target.checked })} />
              {t("login.allowSelfSigned")}
            </label>
            <button className="btn-primary" type="submit">{t("login.saveBackend")}</button>
          </form>
        ) : null}
        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          <p>
            {t("login.defaultAdmin")}: <span className="font-semibold text-slate-900">admin@example.com</span>
          </p>
          <p className="mt-2">{t("login.connectionStatus")}: <span className="font-semibold text-slate-900">{connectionStatus}</span></p>
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
