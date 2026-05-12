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

type Feedback = {
  type: "success" | "error" | "info";
  message: string;
} | null;

type ProviderPreset = {
  value: string;
  label: string;
  baseUrl: string;
  requiresBaseUrl: boolean;
};

const providerPresets: ProviderPreset[] = [
  { value: "openai", label: "OpenAI", baseUrl: "https://api.openai.com", requiresBaseUrl: false },
  { value: "anthropic", label: "Anthropic Claude", baseUrl: "https://api.anthropic.com", requiresBaseUrl: false },
  { value: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com", requiresBaseUrl: false },
  { value: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", requiresBaseUrl: false },
  { value: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai", requiresBaseUrl: false },
  { value: "openai-compatible", label: "OpenAI-compatible", baseUrl: "https://your-upstream.example", requiresBaseUrl: true },
  { value: "local-llm", label: "Local LLM", baseUrl: "http://localhost:11434", requiresBaseUrl: true },
];

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detectingAll, setDetectingAll] = useState(false);
  const [busyIntegrationId, setBusyIntegrationId] = useState("");
  const [form, setForm] = useState<ProviderIntegration>(emptyForm());
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const currentPreset = useMemo(
    () => providerPresets.find((item) => item.value === form.provider) || providerPresets[0],
    [form.provider]
  );

  const stats = useMemo(() => ({
    total: items.length,
    oauth: items.filter((item) => item.auth_mode === "oauth_account").length,
    proxied: items.filter((item) => Boolean(item.proxy_id)).length,
    autoDetect: items.filter((item) => item.model_detection_enabled).length,
  }), [items]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [integrations, proxies, oauths] = await Promise.all([
        apiRequest<ProviderIntegration[]>(withAdminPath("/provider-keys")),
        apiRequest<ProxyNode[]>(withAdminPath("/proxy-nodes")),
        apiRequest<OAuthAccount[]>(withAdminPath("/oauth-accounts")),
      ]);
      setItems(integrations.map(normalizeIntegration));
      setProxyNodes(proxies);
      setOAuthAccounts(oauths);
    } catch (error) {
      setFeedback({ type: "error", message: toMessage(error, t("common.unknownError")) });
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setErrors([]);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEditModal(item: ProviderIntegration) {
    setErrors([]);
    setForm({
      ...normalizeIntegration(item),
      api_keys: ensureKeyRows(item.api_keys),
      oauth_account_id: item.oauth_account_id || "",
      proxy_id: item.proxy_id || "",
    });
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setErrors([]);
  }

  function updateKeyRow(index: number, value: string) {
    setForm((current) => ({
      ...current,
      api_keys: current.api_keys.map((item, itemIndex) => itemIndex === index ? value : item),
    }));
  }

  function addKeyRow() {
    setForm((current) => ({ ...current, api_keys: [...current.api_keys, ""] }));
  }

  function removeKeyRow(index: number) {
    setForm((current) => {
      const next = current.api_keys.filter((_, itemIndex) => itemIndex !== index);
      return { ...current, api_keys: next.length > 0 ? next : [""] };
    });
  }

  function handleProviderChange(value: string) {
    const preset = providerPresets.find((item) => item.value === value);
    setForm((current) => {
      const shouldAutofillBaseUrl = !current.base_url || current.base_url === currentPreset.baseUrl;
      return {
        ...current,
        provider: value,
        base_url: shouldAutofillBaseUrl && preset ? preset.baseUrl : current.base_url,
      };
    });
  }

  function handleAuthModeChange(value: string) {
    setForm((current) => ({
      ...current,
      auth_mode: value,
      api_keys: value === "api_key" ? ensureKeyRows(current.api_keys) : current.api_keys,
      oauth_account_id: value === "oauth_account" ? current.oauth_account_id || "" : "",
    }));
  }

  async function handleSave() {
    const validationErrors = validateForm(form, currentPreset, t);
    setErrors(validationErrors);
    if (validationErrors.length > 0) {
      setFeedback({ type: "error", message: t("common.validation") });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        ...form,
        api_keys: form.auth_mode === "api_key" ? form.api_keys.map((item) => item.trim()).filter(Boolean) : [],
        oauth_account_id: form.auth_mode === "oauth_account" ? form.oauth_account_id || null : null,
        proxy_id: form.proxy_id || null,
      };

      const method = form.id ? "PUT" : "POST";
      const path = form.id ? withAdminPath(`/provider-keys/${form.id}`) : withAdminPath("/provider-keys");
      const saved = await apiRequest<ProviderIntegration>(path, method, payload);

      if (payload.model_detection_enabled && saved.id) {
        await apiRequest(withAdminPath(`/provider-keys/${saved.id}/detect-models`), "POST");
      }

      setFeedback({
        type: "success",
        message: form.id ? t("provider.updated") : t("provider.saved"),
      });
      closeModal();
      await load();
    } catch (error) {
      setFeedback({ type: "error", message: toMessage(error, t("common.unknownError")) });
    } finally {
      setSaving(false);
    }
  }

  async function handleDetectAll() {
    setDetectingAll(true);
    setFeedback(null);
    try {
      await apiRequest(withAdminPath("/provider-keys/detect-models"), "POST");
      setFeedback({ type: "success", message: t("provider.detectedAll") });
      await load();
    } catch (error) {
      setFeedback({ type: "error", message: toMessage(error, t("common.unknownError")) });
    } finally {
      setDetectingAll(false);
    }
  }

  async function handleDetectOne(item: ProviderIntegration) {
    if (!item.id) {
      return;
    }
    setBusyIntegrationId(item.id);
    setFeedback(null);
    try {
      await apiRequest(withAdminPath(`/provider-keys/${item.id}/detect-models`), "POST");
      setFeedback({ type: "success", message: t("provider.detectedOne", { name: item.name }) });
    } catch (error) {
      setFeedback({ type: "error", message: toMessage(error, t("common.unknownError")) });
    } finally {
      setBusyIntegrationId("");
    }
  }

  async function handleDelete(item: ProviderIntegration) {
    if (!item.id) {
      return;
    }
    setBusyIntegrationId(item.id);
    setFeedback(null);
    try {
      await apiRequest(withAdminPath(`/provider-keys/${item.id}`), "DELETE");
      setFeedback({ type: "success", message: t("provider.deleted") });
      await load();
    } catch (error) {
      setFeedback({ type: "error", message: toMessage(error, t("common.unknownError")) });
    } finally {
      setBusyIntegrationId("");
    }
  }

  return (
    <Layout>
      <PageHeader
        title={t("provider.title")}
        description={t("provider.description")}
        action={
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-secondary"
              disabled={detectingAll}
              onClick={handleDetectAll}
              type="button"
            >
              {detectingAll ? t("common.testing") : t("provider.detectAll")}
            </button>
            <button className="btn-primary" onClick={openCreateModal} type="button">
              {t("provider.add")}
            </button>
          </div>
        }
      />

      {feedback ? <div className={feedbackClassName(feedback.type)}>{feedback.message}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={t("provider.summary.total")} value={stats.total} />
        <SummaryCard label={t("provider.summary.oauth")} value={stats.oauth} />
        <SummaryCard label={t("provider.summary.proxied")} value={stats.proxied} />
        <SummaryCard label={t("provider.summary.autoDetect")} value={stats.autoDetect} />
      </div>

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
        emptyMessage={loading ? t("common.testing") : t("common.empty")}
        rows={items.map((item) => [
          <div key={item.id}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900">{item.name}</p>
              <span className="badge-muted">{providerLabel(item.provider)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{item.description || "-"}</p>
            {item.base_url ? <p className="mt-2 text-xs text-slate-400">{item.base_url}</p> : null}
          </div>,
          providerLabel(item.provider),
          strategyLabel(item.access_mode, t),
          credentialLabel(item, t),
          proxyLabel(proxyNodes, item.proxy_id, t),
          <span key={`status-${item.id}`} className="badge-muted">{statusLabel(item.status, t)}</span>,
          <div key={`actions-${item.id}`} className="flex flex-wrap gap-3">
            <button
              className="text-sea"
              disabled={busyIntegrationId === item.id}
              onClick={() => handleDetectOne(item)}
              type="button"
            >
              {t("provider.actionDetect")}
            </button>
            <button className="text-slate-700" onClick={() => openEditModal(item)} type="button">
              {t("common.edit")}
            </button>
            <button
              className="text-danger"
              disabled={busyIntegrationId === item.id}
              onClick={() => handleDelete(item)}
              type="button"
            >
              {t("provider.actionDelete")}
            </button>
          </div>,
        ])}
      />

      <Modal
        closeLabel={t("common.close")}
        description={t("provider.modalDescription")}
        open={open}
        onClose={closeModal}
        title={form.id ? t("provider.modalEditTitle") : t("provider.modalCreateTitle")}
      >
        <div className="grid gap-6">
          {errors.length > 0 ? (
            <div className="alert-error">
              <div className="font-semibold">{t("common.validation")}</div>
              <ul className="mt-2 list-disc pl-5">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">{t("provider.name")}</span>
              <input
                className="field"
                placeholder={t("provider.name")}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">{t("provider.provider")}</span>
              <select className="field" value={form.provider} onChange={(event) => handleProviderChange(event.target.value)}>
                {providerPresets.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">{t("provider.descriptionField")}</span>
              <textarea
                className="field min-h-24"
                placeholder={t("provider.placeholderDescription")}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </label>

            <label className="grid gap-2 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">{t("provider.baseUrl")}</span>
                <span className="text-xs text-slate-400">{t("provider.providerPreset", { provider: currentPreset.label })}: {currentPreset.baseUrl}</span>
              </div>
              <input
                className="field"
                placeholder={currentPreset.baseUrl}
                value={form.base_url || ""}
                onChange={(event) => setForm({ ...form, base_url: event.target.value })}
              />
              <p className="text-xs text-slate-500">{t("provider.baseUrlHelp")}</p>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">{t("provider.authMode")}</span>
              <select className="field" value={form.auth_mode} onChange={(event) => handleAuthModeChange(event.target.value)}>
                <option value="api_key">{t("provider.authApiKey")}</option>
                <option value="oauth_account">{t("provider.authOAuth")}</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">{t("provider.accessMode")}</span>
              <select className="field" value={form.access_mode} onChange={(event) => setForm({ ...form, access_mode: event.target.value })}>
                <option value="round_robin">{t("provider.accessRoundRobin")}</option>
                <option value="priority_fill">{t("provider.accessPriority")}</option>
                <option value="random">{t("provider.accessRandom")}</option>
              </select>
            </label>

            {form.auth_mode === "oauth_account" ? (
              <label className="grid gap-2 md:col-span-2">
                <span className="text-sm font-medium text-slate-700">{t("provider.oauthAccount")}</span>
                <select
                  className="field"
                  value={form.oauth_account_id || ""}
                  onChange={(event) => setForm({ ...form, oauth_account_id: event.target.value })}
                >
                  <option value="">{oauthAccounts.length > 0 ? t("provider.oauthAccount") : t("provider.noOAuth")}</option>
                  {oauthAccounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.provider} / {item.user_id}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">{t("provider.oauthHelp")}</p>
              </label>
            ) : (
              <div className="grid gap-3 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-700">{t("provider.keys")}</span>
                  <button className="btn-secondary" onClick={addKeyRow} type="button">
                    {t("provider.addKey")}
                  </button>
                </div>
                {form.api_keys.map((item, index) => (
                  <div key={`${index}-${form.provider}`} className="flex items-center gap-3">
                    <input
                      className="field"
                      placeholder={t("provider.keyPlaceholder")}
                      value={item}
                      onChange={(event) => updateKeyRow(index, event.target.value)}
                    />
                    <button className="btn-secondary" onClick={() => removeKeyRow(index)} type="button">
                      {t("provider.removeKey")}
                    </button>
                  </div>
                ))}
                <p className="text-xs text-slate-500">{t("provider.keysHelp")}</p>
              </div>
            )}

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">{t("provider.proxy")}</span>
              <select
                className="field"
                value={form.proxy_id || ""}
                onChange={(event) => setForm({ ...form, proxy_id: event.target.value })}
              >
                <option value="">{t("provider.noProxy")}</option>
                {proxyNodes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.host}:{item.port}{item.region ? ` (${item.region})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">{t("provider.priority")}</span>
              <input
                className="field"
                min={0}
                type="number"
                value={form.priority}
                onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}
              />
              <p className="text-xs text-slate-500">{t("provider.priorityHelp")}</p>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">{t("provider.status")}</span>
              <select className="field" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="active">{t("provider.statusActive")}</option>
                <option value="disabled">{t("provider.statusDisabled")}</option>
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.model_detection_enabled}
                onChange={(event) => setForm({ ...form, model_detection_enabled: event.target.checked })}
              />
              {t("provider.modelDetect")}
            </label>
          </div>

          <div className="flex flex-wrap justify-between gap-3">
            <div>
              {form.id ? (
                <button
                  className="btn-secondary"
                  disabled={busyIntegrationId === form.id}
                  onClick={() => handleDetectOne(form)}
                  type="button"
                >
                  {t("provider.detectThis")}
                </button>
              ) : null}
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary" onClick={closeModal} type="button">
                {t("provider.cancel")}
              </button>
              <button className="btn-primary" disabled={saving} onClick={handleSave} type="button">
                {saving ? t("common.saving") : form.id ? t("provider.update") : t("provider.save")}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function normalizeIntegration(item: ProviderIntegration): ProviderIntegration {
  return {
    ...item,
    api_keys: ensureKeyRows(Array.isArray(item.api_keys) ? item.api_keys : item.api_key ? [item.api_key] : []),
  };
}

function ensureKeyRows(value: string[]) {
  return value.length > 0 ? value : [""];
}

function validateForm(
  form: ProviderIntegration,
  preset: ProviderPreset,
  t: (key: string) => string
) {
  const errors: string[] = [];

  if (!form.name.trim()) {
    errors.push(t("provider.validationName"));
  }
  if (!form.provider.trim()) {
    errors.push(t("provider.validationProvider"));
  }
  if (form.auth_mode === "api_key" && form.api_keys.map((item) => item.trim()).filter(Boolean).length === 0) {
    errors.push(t("provider.validationKey"));
  }
  if (form.auth_mode === "oauth_account" && !form.oauth_account_id) {
    errors.push(t("provider.validationOAuth"));
  }
  if (preset.requiresBaseUrl && !(form.base_url || "").trim()) {
    errors.push(t("provider.validationBaseUrl"));
  }
  if (Number.isNaN(form.priority) || form.priority < 0) {
    errors.push(t("provider.validationPriority"));
  }

  return errors;
}

function proxyLabel(items: ProxyNode[], proxyID: string | null | undefined, t: (key: string) => string) {
  const item = items.find((entry) => entry.id === proxyID);
  if (!item) {
    return t("provider.noProxy");
  }
  return `${item.host}:${item.port}`;
}

function providerLabel(value: string) {
  return providerPresets.find((item) => item.value === value)?.label || value;
}

function strategyLabel(value: string, t: (key: string) => string) {
  switch (value) {
    case "random":
      return t("provider.accessRandom");
    case "priority_fill":
      return t("provider.accessPriority");
    default:
      return t("provider.accessRoundRobin");
  }
}

function credentialLabel(item: ProviderIntegration, t: (key: string) => string) {
  if (item.auth_mode === "oauth_account") {
    return t("provider.authOAuth");
  }
  return String(item.api_keys.filter(Boolean).length);
}

function statusLabel(status: string, t: (key: string) => string) {
  if (status === "disabled") {
    return t("status.disabled");
  }
  return t("status.active");
}

function feedbackClassName(type: "success" | "error" | "info") {
  switch (type) {
    case "error":
      return "alert-error";
    case "success":
      return "alert-success";
    default:
      return "alert-info";
  }
}

function toMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
