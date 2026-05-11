import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import Layout from "../../components/Layout";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import { apiRequest, withAdminPath } from "../../lib/api";

type Overview = {
  totals: {
    requests: number;
    tokens: number;
    avg_latency: number;
    errors: number;
  };
  provider_stats: Array<{ provider: string; requests: number; avg_latency: number; tokens: number; errors: number }>;
  proxy_stats: Array<{ proxy_id: string; requests: number; avg_latency: number }>;
  timeline: Array<{ bucket: string; requests: number; tokens: number; avg_latency: number }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<Overview>(withAdminPath("/monitoring/overview"))
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Layout>
      <PageHeader
        title="Overview"
        description="Live operational view across request volume, token consumption, provider health, error rate, and proxy latency."
      />

      {error ? <div className="panel p-6 text-danger">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Requests / 24h" value={data?.totals.requests ?? 0} hint="rolling window" />
        <StatCard title="Tokens / 24h" value={data?.totals.tokens ?? 0} hint="prompt + completion" />
        <StatCard title="Avg latency" value={`${Math.round(data?.totals.avg_latency ?? 0)} ms`} hint="end-to-end" />
        <StatCard title="Errors" value={data?.totals.errors ?? 0} hint="status >= 400" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="panel p-6">
          <h3 className="text-lg font-semibold text-slate-900">Request timeline</h3>
          <p className="mt-1 text-sm text-slate-500">Traffic and token usage aggregated hourly.</p>
          <div className="mt-6 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.timeline ?? []}>
                <defs>
                  <linearGradient id="requestsGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.42} />
                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#dbe4f0" />
                <XAxis dataKey="bucket" tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                <Tooltip />
                <Area dataKey="requests" fill="url(#requestsGradient)" stroke="#1d4ed8" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-6">
          <h3 className="text-lg font-semibold text-slate-900">Proxy latency</h3>
          <p className="mt-1 text-sm text-slate-500">Latency by proxy route observed in usage logs.</p>
          <div className="mt-6 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.proxy_stats ?? []}>
                <CartesianGrid strokeDasharray="4 4" stroke="#dbe4f0" />
                <XAxis dataKey="proxy_id" tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="avg_latency" fill="#14b8a6" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="panel p-6">
        <h3 className="text-lg font-semibold text-slate-900">Provider health</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {(data?.provider_stats ?? []).map((item) => (
            <div key={item.provider} className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold capitalize">{item.provider}</h4>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">{item.requests} req</span>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>Tokens: {item.tokens}</p>
                <p>Avg latency: {Math.round(item.avg_latency)} ms</p>
                <p>Errors: {item.errors}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </Layout>
  );
}
