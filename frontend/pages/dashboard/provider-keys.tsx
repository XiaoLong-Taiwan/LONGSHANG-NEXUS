import { useEffect, useMemo, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

type ProviderIntegration = {
  id?: string;
  name: string;
  description: string;
  provider: string;
  api_key?: string;
  api_keys: string[];
  auth_mode: string;
  oauth_account_id?: string | null;
  base_url?: string;
  access_mode: string;
  priority: number;
  usage_count: number;
  proxy_id?: string | null;
  status: string;
  model_detection_enabled: boolean;
};

type ProxyNode = {
  id: string;
  host: string;
  port: number;
  region?: string;
};

type OAuthAccount = {
  id: string;
  provider: string;
  user_id: string;
};

const emptyForm = (): ProviderIntegration => ({
  name: "",
  description: "",
  provider: "openai",
  api_keys: [""],
  auth_mode: "api_key",
  oauth_account_id: "",
  base_url: "",
  access_mode: "round_robin",
  priority: 100,
  usage_count: 0,
  proxy_id: "",
  status: "active",
  model_detection_enabled: true,
});

export default function ProviderKeysPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<ProviderIntegration[]>([]);
  const [proxyNodes, setProxyNodes] = useState<ProxyNode[]>([]);
  const [oauthAccounts, setOAuthAccounts] = useState<OAuthAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProviderIntegration>(emptyForm());
  const [status, setStatus] = useState("");

  const load = async () => {
    const [integrations, proxies, oauths] = await Promise.all([
      apiRequest<ProviderIntegration[]>(withAdminPath("/provider-keys")),
      apiRequest<ProxyNode[]>(withAdminPath("/proxy-nodes")),
      apiRequest<OAuthAccount[]>(withAdminPath("/oauth-accounts")),
    ]);
    setItems(integrations.map(normalizeIntegration));
    setProxyNodes(proxies);
    setOAuthAccounts(oauths);
  };

  useEffect(() => {
    load();
  }, []);

  const keyCountText = useMemo(() => (value: ProviderIntegration) => {
    if (value.auth_mode === "oauth_account") {
      return "OAuth";
    }
    return String(value.api_keys.filter(Boolean).length);
  }, []);

  async function handleSave() {
    setSaving(true);
    setStatus("");
    try {
      const payload = {
        ...form,
        oauth_account_id: form.oauth_account_id || null,
        proxy_id: form.proxy_id || null,
        api_keys: form.auth_mode === "api_key" ? form.api_keys.filter(Boolean) : [],
      };
      await apiRequest(withAdminPath("/provider-keys"), "POST", payload);
      setOpen(false);
      setForm(emptyForm());
      setStatus("Saved upstream integration");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <PageHeader
        title={t("provider.title")}
        description={t("provider.description")}
        action={
          <div className="flex gap-3">
            <button
              className="btn-secondary"
              onClick={async () => {
                await apiRequest(withAdminPath("/provider-keys/detect-models"), "POST");
                setStatus("Triggered upstream model detection");
              }}
              type="button"
            >
              {t("provider.detectAll")}
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setForm(emptyForm());
                setOpen(true);
              }}
              type="button"
            >
              {t("provider.add")}
            </button>
          </div>
        }
      />

      {status ? <div className="panel p-6 text-slate-700">{status}</div> : null}

      <DataTable
        columns={[
          t("provider.tableName"),
          t("provider.tableProvider"),
          t("provider.tableStrategy"),
          t("provider.tableKeys"),
          t("provider.tableProxy"),
          t("provider.tableStatus"),
          t("provider.tableActions"),
        ]}
        rows={items.map((item) => [
          <div key={item.id}>
            <p className="font-semibold text-slate-900">{item.name}</p>
            <p className="mt-1 text-xs text-slate-500">{item.description || "-"}</p>
          </div>,
          item.provider,
          item.access_mode,
          keyCountText(item),
          proxyLabel(proxyNodes, item.proxy_id),
          item.status,
          <div key={`actions-${item.id}`} className="flex gap-3">
            <button
              className="text-sea"
              onClick={async () => {
                await apiRequest(withAdminPath(`/provider-keys/${item.id}/detect-models`), "POST");
                setStatus(`Detected models for ${item.name}`);
              }}
            >
              {t("provider.actionDetect")}
            </button>
            <button
              className="text-slate-700"
              onClick={() => {
                setForm(item);
                setOpen(true);
              }}
            >
              Edit
            </button>
            <button
              className="text-danger"
              onClick={async () => {
                await apiRequest(withAdminPath(`/provider-keys/${item.id}`), "DELETE");
                await load();
              }}
            >
              {t("provider.actionDelete")}
            </button>
          </div>,
        ])}
      />

      <Modal open={open} onClose={() => setOpen(false)} title={t("provider.modalTitle")}>
        <div className="grid gap-4 md:grid-cols-2">
          <input className="field" placeholder={t("provider.name")} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <select className="field" value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })}>
            <option value="openai">openai</option>
            <option value="anthropic">anthropic</option>
            <option value="gemini">gemini</option>
            <option value="openai-compatible">openai-compatible</option>
            <option value="local-llm">local-llm</option>
          </select>
          <textarea className="field md:col-span-2 min-h-24" placeholder={t("provider.descriptionField")} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          <input className="field md:col-span-2" placeholder={t("provider.baseUrl")} value={form.base_url || ""} onChange={(event) => setForm({ ...form, base_url: event.target.value })} />
          <select className="field" value={form.auth_mode} onChange={(event) => setForm({ ...form, auth_mode: event.target.value })}>
            <option value="api_key">API Key</option>
            <option value="oauth_account">OAuth Account Token</option>
          </select>
          <select className="field" value={form.access_mode} onChange={(event) => setForm({ ...form, access_mode: event.target.value })}>
            <option value="round_robin">Round Robin</option>
            <option value="priority_fill">Fill First</option>
            <option value="random">Random</option>
          </select>
          {form.auth_mode === "oauth_account" ? (
            <select className="field md:col-span-2" value={form.oauth_account_id || ""} onChange={(event) => setForm({ ...form, oauth_account_id: event.target.value })}>
              <option value="">{t("provider.oauthAccount")}</option>
              {oauthAccounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.provider} / {item.user_id}
                </option>
              ))}
            </select>
          ) : (
            <div className="md:col-span-2">
              <textarea
                className="field min-h-36"
                placeholder={t("provider.keys")}
                value={form.api_keys.join("\n")}
                onChange={(event) => setForm({ ...form, api_keys: event.target.value.split("\n") })}
              />
              <p className="mt-2 text-sm text-slate-500">{t("provider.keysHelp")}</p>
            </div>
          )}
          <select className="field" value={form.proxy_id || ""} onChange={(event) => setForm({ ...form, proxy_id: event.target.value })}>
            <option value="">{t("provider.proxy")}</option>
            {proxyNodes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.host}:{item.port} {item.region ? `(${item.region})` : ""}
              </option>
            ))}
          </select>
          <input className="field" type="number" placeholder="Priority" value={form.priority} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })} />
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 md:col-span-2">
            <input type="checkbox" checked={form.model_detection_enabled} onChange={(event) => setForm({ ...form, model_detection_enabled: event.target.checked })} />
            {t("provider.modelDetect")}
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setOpen(false)} type="button">
            {t("provider.cancel")}
          </button>
          <button className="btn-primary" disabled={saving} onClick={handleSave} type="button">
            {saving ? "Saving..." : t("provider.save")}
          </button>
        </div>
      </Modal>
    </Layout>
  );
}

function normalizeIntegration(item: ProviderIntegration): ProviderIntegration {
  return {
    ...item,
    api_keys: Array.isArray(item.api_keys) ? item.api_keys : item.api_key ? [item.api_key] : [],
  };
}

function proxyLabel(items: ProxyNode[], proxyID?: string | null) {
  const item = items.find((entry) => entry.id === proxyID);
  if (!item) {
    return "-";
  }
  return `${item.host}:${item.port}`;
}
