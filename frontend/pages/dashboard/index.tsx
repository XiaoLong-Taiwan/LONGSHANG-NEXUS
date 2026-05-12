import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import Layout from "../../components/Layout";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import { apiRequest, withAdminPath } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

type Overview = {
  totals: {
    requests: number;
    tokens: number;
    avg_latency: number;
    p95_latency: number;
    errors: number;
    rpm: number;
    tpm: number;
    success_rate: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
  provider_stats: Array<{ provider: string; requests: number; avg_latency: number; tokens: number; errors: number }>;
  proxy_stats: Array<{ proxy_id: string; requests: number; avg_latency: number }>;
  timeline: Array<{ bucket: string; requests: number; tokens: number; avg_latency: number }>;
  model_stats: Array<{ model: string; requests: number; tokens: number }>;
};

export default function DashboardPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<Overview>(withAdminPath("/monitoring/overview"))
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Layout>
      <PageHeader title={t("overview.title")} description={t("overview.description")} />

      {error ? <div className="alert-error">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard title={t("overview.requests24h")} value={data?.totals.requests ?? 0} hint={t("overview.rollingWindow")} />
        <StatCard title={t("overview.tokens24h")} value={data?.totals.tokens ?? 0} hint={t("overview.promptAndCompletion")} />
        <StatCard title={t("overview.avgLatency")} value={`${Math.round(data?.totals.avg_latency ?? 0)} ms`} hint={t("overview.endToEnd")} />
        <StatCard title={t("overview.p95Latency")} value={`${Math.round(data?.totals.p95_latency ?? 0)} ms`} hint="tail" />
        <StatCard title={t("overview.rpm")} value={(data?.totals.rpm ?? 0).toFixed(2)} hint="24h avg" />
        <StatCard title={t("overview.tpm")} value={(data?.totals.tpm ?? 0).toFixed(2)} hint="24h avg" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title={t("overview.successRate")} value={`${Math.round((data?.totals.success_rate ?? 0) * 100)}%`} hint="status < 400" />
        <StatCard title="Prompt tokens" value={data?.totals.prompt_tokens ?? 0} hint="24h" />
        <StatCard title="Completion tokens" value={data?.totals.completion_tokens ?? 0} hint="24h" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="panel p-6">
          <h3 className="text-lg font-semibold text-app">{t("overview.timelineTitle")}</h3>
          <p className="mt-1 text-sm text-app-muted">{t("overview.timelineDescription")}</p>
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
          <h3 className="text-lg font-semibold text-app">{t("overview.proxyLatencyTitle")}</h3>
          <p className="mt-1 text-sm text-app-muted">{t("overview.proxyLatencyDescription")}</p>
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

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="panel p-6">
          <h3 className="text-lg font-semibold text-app">{t("overview.providerHealthTitle")}</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {(data?.provider_stats ?? []).map((item) => (
            <div key={item.provider} className="rounded-[15px] border border-app bg-transparent p-5">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold capitalize">{item.provider}</h4>
                <span className="badge-muted">
                  {t("overview.providerRequests", { count: item.requests })}
                </span>
              </div>
              <div className="mt-4 space-y-2 text-sm text-app-muted">
                <p>{t("overview.providerTokens", { count: item.tokens })}</p>
                <p>{t("overview.providerLatency", { count: Math.round(item.avg_latency) })}</p>
                <p>{t("overview.providerErrors", { count: item.errors })}</p>
              </div>
            </div>
          ))}
          </div>
        </section>

        <section className="panel p-6">
          <h3 className="text-lg font-semibold text-app">Top models</h3>
          <div className="mt-4 space-y-3">
            {(data?.model_stats ?? []).slice(0, 8).map((item) => (
              <div key={item.model} className="rounded-[15px] border border-app px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <code className="text-sm text-app">{item.model}</code>
                  <span className="badge-muted">{item.requests} req</span>
                </div>
                <p className="mt-2 text-sm text-app-muted">{item.tokens} tokens</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
