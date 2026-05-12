import { useEffect, useMemo, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

type AggregateModel = {
  model_name: string;
  providers: string[];
  types: string[];
  priority: number;
  status: string;
  last_checked: string;
  upstreams: Array<{
    provider: string;
    integration_id: string;
    integration_name: string;
    source: string;
  }>;
};

type ProviderIntegration = {
  id: string;
  name: string;
  provider: string;
  auth_mode: string;
  status: string;
};

type ModelMapping = {
  id?: string;
  public_model: string;
  provider: string;
  upstream_model: string;
  type: string;
  provider_key_id?: string | null;
  priority: number;
  status: string;
};

const emptyMapping: ModelMapping = {
  public_model: "",
  provider: "openai",
  upstream_model: "",
  type: "chat",
  provider_key_id: "",
  priority: 100,
  status: "active",
};

export default function ModelsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<AggregateModel[]>([]);
  const [mappings, setMappings] = useState<ModelMapping[]>([]);
  const [integrations, setIntegrations] = useState<ProviderIntegration[]>([]);
  const [detail, setDetail] = useState<AggregateModel | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingForm, setMappingForm] = useState<ModelMapping>(emptyMapping);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);

  const providerOptions = useMemo(() => {
    const values = new Set(["openai", "openai-compatible", "local-llm", "anthropic", "gemini", "deepseek", "mistral"]);
    integrations.forEach((item) => values.add(item.provider));
    items.forEach((item) => item.providers.forEach((provider) => values.add(provider)));
    return Array.from(values);
  }, [integrations, items]);

  async function load() {
    setLoading(true);
    try {
      const [models, modelMappings, providerKeys] = await Promise.all([
        apiRequest<AggregateModel[]>(withAdminPath("/models/aggregate")),
        apiRequest<ModelMapping[]>(withAdminPath("/model-mappings")),
        apiRequest<ProviderIntegration[]>(withAdminPath("/provider-keys")),
      ]);
      setItems(models);
      setMappings(modelMappings);
      setIntegrations(providerKeys);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((error) => setFeedback(error instanceof Error ? error.message : "Failed to load"));
  }, []);

  function openMapping(model?: AggregateModel) {
    if (!model) {
      setMappingForm(emptyMapping);
      setMappingOpen(true);
      return;
    }
    setMappingForm({
      ...emptyMapping,
      public_model: model.model_name,
      upstream_model: model.model_name,
      provider: model.providers[0] || "openai",
      type: model.types[0] || "chat",
      provider_key_id: model.upstreams[0]?.integration_id || "",
    });
    setMappingOpen(true);
  }

  function editMapping(mapping: ModelMapping) {
    setMappingForm({ ...mapping, provider_key_id: mapping.provider_key_id || "" });
    setMappingOpen(true);
  }

  async function saveMapping() {
    if (!mappingForm.public_model.trim() || !mappingForm.provider.trim()) {
      setFeedback(t("common.validation"));
      return;
    }
    const payload = {
      ...mappingForm,
      upstream_model: mappingForm.upstream_model.trim() || mappingForm.public_model.trim(),
      provider_key_id: mappingForm.provider_key_id || null,
    };
    const path = mappingForm.id ? withAdminPath(`/model-mappings/${mappingForm.id}`) : withAdminPath("/model-mappings");
    const method: "PUT" | "POST" = mappingForm.id ? "PUT" : "POST";
    await apiRequest(path, method, payload);
    setFeedback(t("models.mappingSaved"));
    setMappingOpen(false);
    setMappingForm(emptyMapping);
    await load();
  }

  async function deleteMapping(mapping: ModelMapping) {
    if (!mapping.id) return;
    await apiRequest(withAdminPath(`/model-mappings/${mapping.id}`), "DELETE");
    setFeedback(t("models.mappingDeleted"));
    await load();
  }

  function aliasesFor(model: AggregateModel) {
    return mappings
      .filter((item) => item.upstream_model === model.model_name || item.public_model === model.model_name)
      .map((item) => item.public_model);
  }

  return (
    <Layout>
      <PageHeader
        title={t("models.title")}
        description={t("models.description")}
        action={
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-secondary"
              onClick={async () => {
                await apiRequest(withAdminPath("/provider-keys/detect-models"), "POST");
                await load();
                setFeedback(t("models.detectSuccess"));
              }}
              type="button"
            >
              {t("models.detectAll")}
            </button>
            <button
              className="btn-secondary"
              onClick={async () => {
                await apiRequest(withAdminPath("/models/sync"), "POST");
                await load();
                setFeedback(t("models.syncSuccess"));
              }}
              type="button"
            >
              {t("models.syncAll")}
            </button>
            <button className="btn-primary" onClick={() => openMapping()} type="button">{t("models.addMapping")}</button>
          </div>
        }
      />

      {feedback ? <div className="alert-info">{feedback}</div> : null}

      <div className="grid gap-5">
        <section className="grid gap-3">
          <div>
            <h2 className="text-lg font-semibold text-app">{t("models.upstreamCatalog")}</h2>
            <p className="text-sm text-app-muted">{t("models.upstreamCatalogHelp")}</p>
          </div>
          <DataTable
            columns={[t("models.model"), t("models.provider"), t("models.type"), t("models.mappedAs"), t("models.upstreams"), t("models.lastChecked"), t("common.actions")]}
            emptyMessage={loading ? t("common.loading") : t("common.empty")}
            rows={items.map((item) => {
              const aliases = aliasesFor(item);
              return [
                <code key={item.model_name}>{item.model_name}</code>,
                item.providers.join(", "),
                item.types.join(", "),
                aliases.length > 0 ? aliases.join(", ") : "-",
                item.upstreams.length,
                item.last_checked ? new Date(item.last_checked).toLocaleString() : "-",
                <div key={`actions-${item.model_name}`} className="flex flex-wrap gap-3">
                  <button className="text-app-muted" onClick={() => setDetail(item)} type="button">{t("models.view")}</button>
                  <button className="text-app-muted" onClick={() => openMapping(item)} type="button">{t("models.mapModel")}</button>
                </div>,
              ];
            })}
          />
        </section>

        <section className="grid gap-3">
          <div>
            <h2 className="text-lg font-semibold text-app">{t("models.mappingTitle")}</h2>
            <p className="text-sm text-app-muted">{t("models.mappingDescription")}</p>
          </div>
          <DataTable
            columns={[t("models.publicModel"), t("models.upstreamModel"), t("models.provider"), t("models.type"), t("models.accountPool"), t("models.priority"), t("common.actions")]}
            emptyMessage={loading ? t("common.loading") : t("common.empty")}
            rows={mappings.map((item) => [
              <code key={item.id}>{item.public_model}</code>,
              item.upstream_model,
              item.provider,
              item.type,
              integrationLabel(integrations, item.provider_key_id),
              item.priority,
              <div key={`mapping-${item.id}`} className="flex flex-wrap gap-3">
                <button className="text-app-muted" onClick={() => editMapping(item)} type="button">{t("common.edit")}</button>
                <button className="text-danger" onClick={() => void deleteMapping(item)} type="button">{t("common.delete")}</button>
              </div>,
            ])}
          />
        </section>
      </div>

      <Modal
        closeLabel={t("common.close")}
        description={t("models.detailDescription")}
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.model_name || t("models.detail")}
      >
        <div className="grid gap-3">
          {(detail?.upstreams || []).map((item) => (
            <div key={`${item.provider}-${item.integration_id}-${item.source}`} className="rounded-[15px] border border-app px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-app">{item.integration_name || item.provider}</p>
                <span className="badge-muted">{item.source}</span>
              </div>
              <p className="mt-2 text-sm text-app-muted">{item.provider}</p>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        closeLabel={t("common.close")}
        description={t("models.mappingModalDescription")}
        open={mappingOpen}
        onClose={() => setMappingOpen(false)}
        title={mappingForm.id ? t("models.editMapping") : t("models.addMapping")}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("models.publicModel")}</span>
            <input className="field" value={mappingForm.public_model} onChange={(event) => setMappingForm({ ...mappingForm, public_model: event.target.value })} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("models.upstreamModel")}</span>
            <input className="field" value={mappingForm.upstream_model} onChange={(event) => setMappingForm({ ...mappingForm, upstream_model: event.target.value })} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("models.provider")}</span>
            <select className="field" value={mappingForm.provider} onChange={(event) => setMappingForm({ ...mappingForm, provider: event.target.value, provider_key_id: "" })}>
              {providerOptions.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("models.type")}</span>
            <select className="field" value={mappingForm.type} onChange={(event) => setMappingForm({ ...mappingForm, type: event.target.value })}>
              <option value="chat">chat</option>
              <option value="embedding">embedding</option>
              <option value="image">image</option>
            </select>
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-medium text-app">{t("models.accountPool")}</span>
            <select className="field" value={mappingForm.provider_key_id || ""} onChange={(event) => setMappingForm({ ...mappingForm, provider_key_id: event.target.value })}>
              <option value="">{t("models.anyPool")}</option>
              {integrations
                .filter((item) => item.provider === mappingForm.provider)
                .map((item) => <option key={item.id} value={item.id}>{item.name || item.provider}</option>)}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("models.priority")}</span>
            <input className="field" type="number" value={mappingForm.priority} onChange={(event) => setMappingForm({ ...mappingForm, priority: Number(event.target.value) })} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("models.status")}</span>
            <select className="field" value={mappingForm.status} onChange={(event) => setMappingForm({ ...mappingForm, status: event.target.value })}>
              <option value="active">{t("status.active")}</option>
              <option value="disabled">{t("status.disabled")}</option>
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setMappingOpen(false)} type="button">{t("common.cancel")}</button>
          <button className="btn-primary" onClick={saveMapping} type="button">{t("common.save")}</button>
        </div>
      </Modal>
    </Layout>
  );
}

function integrationLabel(items: ProviderIntegration[], id?: string | null) {
  const match = items.find((item) => item.id === id);
  return match ? (match.name || match.provider) : "-";
}
