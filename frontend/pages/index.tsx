import { useRouter } from "next/router";
import { FormEvent, useEffect, useState } from "react";

import { login, setToken } from "../lib/api";

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123456");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof router.query.token === "string") {
      setToken(router.query.token);
      router.replace("/dashboard");
    }
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await login(email, password);
      setToken(result.token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
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
            "OpenAI-compatible endpoints",
            "Proxy-aware provider key pool",
            "Single-port nginx edge gateway",
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
            Use the local admin account to enter the control plane. Third-party login is hidden from the homepage for a cleaner self-hosted flow.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
          <input className="field" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button className="btn-primary w-full" disabled={loading} type="submit">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          Default development account: <span className="font-semibold text-slate-900">admin@example.com</span>
        </div>
      </section>
    </div>
  );
}
