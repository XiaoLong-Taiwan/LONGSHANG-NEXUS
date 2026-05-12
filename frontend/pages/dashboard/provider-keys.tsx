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
  model_overrides: string[];
  test_model: string;
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
  name: string;
  email: string;
  quota_used: number;
  quota_total: number;
  quota_unit: string;
};

type Feedback = { type: "success" | "error" | "info"; message: string } | null;
type ModalMode = "closed" | "api" | "oauth";
type TestResult = Record<string, unknown> | null;

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

const emptyForm = (authMode: "api_key" | "oauth_account"): ProviderIntegration => ({
  name: "",
  description: "",
  provider: "openai",
  api_keys: [""],
  auth_mode: authMode,
  oauth_account_id: "",
  base_url: "",
  access_mode: "round_robin",
  priority: 100,
  usage_count: 0,
  proxy_id: "",
  status: "active",
  model_detection_enabled: true,
  model_overrides: [],
  test_model: "",
});

export default function ProviderKeysPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<ProviderIntegration[]>([]);
  const [proxyNodes, setProxyNodes] = useState<ProxyNode[]>([]);
  const [oauthAccounts, setOAuthAccounts] = useState<OAuthAccount[]>([]);
  const [modalMode, setModalMode] = useState<ModalMode>("closed");
  const [form, setForm] = useState<ProviderIntegration>(emptyForm("api_key"));
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testType, setTestType] = useState("models");
  const [testResult, setTestResult] = useState<TestResult>(null);

  const currentPreset = useMemo(
    () => providerPresets.find((item) => item.value === form.provider) || providerPresets[0],
    [form.provider]
  );

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
      setFeedback({ type: "error", message: toMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal(mode: "api" | "oauth") {
    setModalMode(mode);
    setForm(emptyForm(mode === "api" ? "api_key" : "oauth_account"));
    setErrors([]);
    setTestResult(null);
  }

  function openEditModal(item: ProviderIntegration) {
    setModalMode(item.auth_mode === "oauth_account" ? "oauth" : "api");
    setForm(normalizeIntegration(item));
    setErrors([]);
    setTestResult(null);
  }

  function closeModal() {
    setModalMode("closed");
    setErrors([]);
    setTestResult(null);
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

  function addModelRow() {
    setForm((current) => ({ ...current, model_overrides: [...current.model_overrides, ""] }));
  }

  function updateModelRow(index: number, value: string) {
    setForm((current) => ({
      ...current,
      model_overrides: current.model_overrides.map((item, itemIndex) => itemIndex === index ? value : item),
    }));
  }

  function removeModelRow(index: number) {
    setForm((current) => ({ ...current, model_overrides: current.model_overrides.filter((_, itemIndex) => itemIndex !== index) }));
  }

  async function handleDiscoverModels() {
    setDiscovering(true);
    try {
      const result = await apiRequest<{ models: string[] }>(withAdminPath("/provider-keys/discover-models"), "POST", buildDiscoverPayload(form));
      setForm((current) => ({ ...current, model_overrides: result.models }));
      setFeedback({ type: "success", message: t("provider.syncSuccess") });
    } catch (error) {
      setFeedback({ type: "error", message: toMessage(error) });
    } finally {
      setDiscovering(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiRequest<Record<string, unknown>>(withAdminPath("/provider-keys/test"), "POST", {
        ...buildDiscoverPayload(form),
        test_type: testType,
        test_model: form.test_model,
      });
      setTestResult(result);
      setFeedback({ type: "success", message: t("provider.testSuccess") });
    } catch (error) {
      setFeedback({ type: "error", message: toMessage(error) });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    const validationErrors = validateForm(form, currentPreset, t);
    setErrors(validationErrors);
    if (validationErrors.length > 0) {
      setFeedback({ type: "error", message: t("common.validation") });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        api_keys: form.api_keys.map((item) => item.trim()).filter(Boolean),
        model_overrides: form.model_overrides.map((item) => item.trim()).filter(Boolean),
        proxy_id: form.proxy_id || null,
        oauth_account_id: form.auth_mode === "oauth_account" ? form.oauth_account_id || null : null,
      };
      const path = form.id ? withAdminPath(`/provider-keys/${form.id}`) : withAdminPath("/provider-keys");
      const method: "PUT" | "POST" = form.id ? "PUT" : "POST";
      await apiRequest(path, method, payload);
      setFeedback({ type: "success", message: form.id ? t("provider.updated") : t("provider.saved") });
      closeModal();
      await load();
    } catch (error) {
      setFeedback({ type: "error", message: toMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: ProviderIntegration) {
    try {
      await apiRequest(withAdminPath(`/provider-keys/${item.id}`), "DELETE");
      setFeedback({ type: "success", message: t("provider.deleted") });
      await load();
    } catch (error) {
      setFeedback({ type: "error", message: toMessage(error) });
    }
  }

  return (
    <Layout>
      <PageHeader
        title={t("provider.title")}
        description={t("provider.description")}
        action={
          <div className="flex flex-wrap gap-3">
            <button className="btn-secondary" onClick={() => openCreateModal("oauth")} type="button">{t("provider.addOAuth")}</button>
            <button className="btn-primary" onClick={() => openCreateModal("api")} type="button">{t("provider.addApi")}</button>
          </div>
        }
      />

      {feedback ? <div className={feedback.type === "error" ? "alert-error" : feedback.type === "success" ? "alert-success" : "alert-info"}>{feedback.message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <DataTable
          columns={[t("provider.tableName"), t("provider.tableProvider"), t("provider.tableModels"), t("provider.tableProxy"), t("provider.tableStatus"), t("provider.tableActions")]}
          emptyMessage={loading ? t("common.loading") : t("common.empty")}
          rows={items.filter((item) => item.auth_mode === "api_key").map((item) => [
            renderUpstreamName(item),
            item.provider,
            modelCountLabel(item, t),
            proxyLabel(proxyNodes, item.proxy_id, t),
            <span key={item.id} className="badge-muted">{item.status}</span>,
            renderActions(item, openEditModal, handleDelete, t),
          ])}
        />

        <DataTable
          columns={[t("provider.tableName"), t("provider.tableProvider"), t("provider.tableOAuth"), t("provider.tableProxy"), t("provider.tableStatus"), t("provider.tableActions")]}
          emptyMessage={loading ? t("common.loading") : t("common.empty")}
          rows={items.filter((item) => item.auth_mode === "oauth_account").map((item) => [
            renderUpstreamName(item),
            item.provider,
            oauthLabel(oauthAccounts, item.oauth_account_id),
            proxyLabel(proxyNodes, item.proxy_id, t),
            <span key={item.id} className="badge-muted">{item.status}</span>,
            renderActions(item, openEditModal, handleDelete, t),
          ])}
        />
      </div>

      <Modal
        closeLabel={t("common.close")}
        description={modalMode === "oauth" ? t("provider.modalOAuthDescription") : t("provider.modalApiDescription")}
        open={modalMode !== "closed"}
        onClose={closeModal}
        title={form.id ? (modalMode === "oauth" ? t("provider.modalOAuthEditTitle") : t("provider.modalApiEditTitle")) : (modalMode === "oauth" ? t("provider.modalOAuthCreateTitle") : t("provider.modalApiCreateTitle"))}
      >
        <div className="grid gap-6">
          {errors.length > 0 ? (
            <div className="alert-error">
              <ul className="list-disc pl-5">
                {errors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-app">{t("provider.name")}</span>
              <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-app">{t("provider.provider")}</span>
              <select className="field" value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })}>
                {providerPresets.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 lg:col-span-2">
              <span className="text-sm font-medium text-app">{t("provider.descriptionField")}</span>
              <textarea className="field min-h-24" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>

            <label className="grid gap-2 lg:col-span-2">
              <span className="text-sm font-medium text-app">{t("provider.baseUrl")}</span>
              <input className="field" placeholder={currentPreset.baseUrl} value={form.base_url || ""} onChange={(event) => setForm({ ...form, base_url: event.target.value })} />
            </label>

            {modalMode === "oauth" ? (
              <label className="grid gap-2 lg:col-span-2">
                <span className="text-sm font-medium text-app">{t("provider.oauthAccount")}</span>
                <select className="field" value={form.oauth_account_id || ""} onChange={(event) => setForm({ ...form, oauth_account_id: event.target.value })}>
                  <option value="">{t("provider.noOAuth")}</option>
                  {oauthAccounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.provider} {item.quota_total ? `(${item.quota_used}/${item.quota_total} ${item.quota_unit || ""})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="grid gap-3 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-app">{t("provider.keys")}</span>
                  <button className="btn-secondary" onClick={addKeyRow} type="button">{t("provider.addKey")}</button>
                </div>
                {form.api_keys.map((item, index) => (
                  <div key={`${index}-${form.id || "new"}`} className="flex gap-3">
                    <input className="field" value={item} placeholder={t("provider.keyPlaceholder")} onChange={(event) => updateKeyRow(index, event.target.value)} />
                    <button className="btn-secondary" onClick={() => removeKeyRow(index)} type="button">{t("provider.removeKey")}</button>
                  </div>
                ))}
              </div>
            )}

            <label className="grid gap-2">
              <span className="text-sm font-medium text-app">{t("provider.accessMode")}</span>
              <select className="field" value={form.access_mode} onChange={(event) => setForm({ ...form, access_mode: event.target.value })}>
                <option value="round_robin">{t("provider.accessRoundRobin")}</option>
                <option value="priority_fill">{t("provider.accessPriority")}</option>
                <option value="random">{t("provider.accessRandom")}</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-app">{t("provider.proxy")}</span>
              <select className="field" value={form.proxy_id || ""} onChange={(event) => setForm({ ...form, proxy_id: event.target.value })}>
                <option value="">{t("provider.noProxy")}</option>
                {proxyNodes.map((item) => (
                  <option key={item.id} value={item.id}>{item.host}:{item.port}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-app">{t("provider.priority")}</span>
              <input className="field" type="number" min={0} value={form.priority} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })} />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-app">{t("provider.status")}</span>
              <select className="field" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="active">{t("provider.statusActive")}</option>
                <option value="disabled">{t("provider.statusDisabled")}</option>
              </select>
            </label>

            <label className="grid gap-2 lg:col-span-2">
              <span className="text-sm font-medium text-app">{t("provider.testType")}</span>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <select className="field" value={testType} onChange={(event) => setTestType(event.target.value)}>
                  <option value="models">{t("provider.testModelsType")}</option>
                  <option value="chat">{t("provider.testChatType")}</option>
                  <option value="embeddings">{t("provider.testEmbeddingType")}</option>
                  <option value="image">{t("provider.testImageType")}</option>
                </select>
                <input className="field" placeholder={t("provider.testModel")} value={form.test_model} onChange={(event) => setForm({ ...form, test_model: event.target.value })} />
                <button className="btn-secondary" disabled={testing} onClick={handleTestConnection} type="button">
                  {testing ? t("common.testing") : t("provider.testConnection")}
                </button>
              </div>
            </label>

            <div className="grid gap-3 lg:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-app">{t("provider.models")}</span>
                <div className="flex gap-3">
                  <button className="btn-secondary" onClick={addModelRow} type="button">{t("provider.addModel")}</button>
                  <button className="btn-secondary" disabled={discovering} onClick={handleDiscoverModels} type="button">
                    {discovering ? t("common.testing") : t("provider.syncModels")}
                  </button>
                </div>
              </div>
              {form.model_overrides.length === 0 ? (
                <div className="rounded-[15px] border border-dashed border-app px-4 py-4 text-sm text-app-muted">
                  {t("provider.noModels")}
                </div>
              ) : null}
              {form.model_overrides.map((item, index) => (
                <div key={`model-${index}`} className="flex gap-3">
                  <input className="field" value={item} onChange={(event) => updateModelRow(index, event.target.value)} />
                  <button className="btn-secondary" onClick={() => removeModelRow(index)} type="button">{t("provider.removeKey")}</button>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-3 rounded-[15px] border border-app px-4 py-3 text-sm text-app lg:col-span-2">
              <input type="checkbox" checked={form.model_detection_enabled} onChange={(event) => setForm({ ...form, model_detection_enabled: event.target.checked })} />
              {t("provider.modelDetect")}
            </label>
          </div>

          {testResult ? (
            <div className="panel p-4">
              <p className="text-sm font-semibold text-app">{t("provider.testResult")}</p>
              <pre className="mt-3 overflow-auto text-xs text-app-muted">{JSON.stringify(testResult, null, 2)}</pre>
            </div>
          ) : null}

          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={closeModal} type="button">{t("provider.cancel")}</button>
            <button className="btn-primary" disabled={saving} onClick={handleSave} type="button">
              {saving ? t("common.saving") : form.id ? t("provider.update") : t("provider.save")}
            </button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}

function normalizeIntegration(item: ProviderIntegration): ProviderIntegration {
  return {
    ...item,
    api_keys: Array.isArray(item.api_keys) ? (item.api_keys.length > 0 ? item.api_keys : [""]) : item.api_key ? [item.api_key] : [""],
    model_overrides: Array.isArray(item.model_overrides) ? item.model_overrides : [],
    oauth_account_id: item.oauth_account_id || "",
    proxy_id: item.proxy_id || "",
  };
}

function renderUpstreamName(item: ProviderIntegration) {
  return (
    <div key={item.id}>
      <p className="font-semibold text-app">{item.name}</p>
      <p className="mt-1 text-xs text-app-muted">{item.description || "-"}</p>
    </div>
  );
}

function renderActions(
  item: ProviderIntegration,
  onEdit: (item: ProviderIntegration) => void,
  onDelete: (item: ProviderIntegration) => Promise<void>,
  t: (key: string) => string
) {
  return (
    <div key={`action-${item.id}`} className="flex flex-wrap gap-3">
      <button className="text-app-muted" onClick={() => onEdit(item)} type="button">{t("common.edit")}</button>
      <button className="text-danger" onClick={() => void onDelete(item)} type="button">{t("common.delete")}</button>
    </div>
  );
}

function modelCountLabel(item: ProviderIntegration, t: (key: string) => string) {
  return item.model_overrides.length > 0 ? `${item.model_overrides.length} ${t("provider.models")}` : "-";
}

function proxyLabel(items: ProxyNode[], proxyID: string | null | undefined, t: (key: string) => string) {
  const match = items.find((item) => item.id === proxyID);
  return match ? `${match.host}:${match.port}` : t("provider.noProxy");
}

function oauthLabel(items: OAuthAccount[], oauthID?: string | null) {
  const match = items.find((item) => item.id === oauthID);
  return match ? (match.name || match.provider) : "-";
}

function validateForm(form: ProviderIntegration, preset: ProviderPreset, t: (key: string) => string) {
  const errors: string[] = [];
  if (!form.name.trim()) errors.push(t("provider.validationName"));
  if (!form.provider.trim()) errors.push(t("provider.validationProvider"));
  if (form.auth_mode === "api_key" && form.api_keys.map((item) => item.trim()).filter(Boolean).length === 0) errors.push(t("provider.validationKey"));
  if (form.auth_mode === "oauth_account" && !form.oauth_account_id) errors.push(t("provider.validationOAuth"));
  if (preset.requiresBaseUrl && !(form.base_url || "").trim()) errors.push(t("provider.validationBaseUrl"));
  if (Number.isNaN(form.priority) || form.priority < 0) errors.push(t("provider.validationPriority"));
  return errors;
}

function buildDiscoverPayload(form: ProviderIntegration) {
  return {
    provider: form.provider,
    name: form.name,
    auth_mode: form.auth_mode,
    oauth_account_id: form.oauth_account_id || null,
    api_keys: form.api_keys.map((item) => item.trim()).filter(Boolean),
    base_url: form.base_url || "",
    proxy_id: form.proxy_id || null,
    test_model: form.test_model,
  };
}

function toMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Request failed";
}
