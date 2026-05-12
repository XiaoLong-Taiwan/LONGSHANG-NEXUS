import { FormEvent, useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import PageHeader from "../../components/PageHeader";
import { probeConnection } from "../../lib/api";
import { getActiveConnection, loadConnections, removeConnection, setActiveConnection, upsertConnection, type BackendConnection } from "../../lib/connections";
import { useI18n } from "../../lib/i18n";

const emptyForm: BackendConnection = {
  id: "",
  name: "",
  baseUrl: "http://localhost:18437",
  allowInsecureTls: false,
};

export default function ConnectionsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<BackendConnection[]>([]);
  const [activeId, setActiveId] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState<BackendConnection>(emptyForm);

  function refresh() {
    const connections = loadConnections();
    const active = getActiveConnection();
    setItems(connections);
    setActiveId(active.id);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const connection = {
      ...form,
      id: form.id || slugify(form.name || form.baseUrl),
    };
    upsertConnection(connection);
    setForm(emptyForm);
    refresh();
    setStatus(t("connections.saved", { name: connection.name }));
  }

  return (
    <Layout>
      <PageHeader title={t("connections.title")} description={t("connections.description")} />

      {status ? <div className="alert-info">{status}</div> : null}

      <form className="panel grid gap-4 p-6 md:grid-cols-4" onSubmit={handleSubmit}>
        <input className="field" placeholder={t("connections.name")} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input className="field md:col-span-2" placeholder={t("connections.baseUrl")} value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} />
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <input type="checkbox" checked={form.allowInsecureTls} onChange={(event) => setForm({ ...form, allowInsecureTls: event.target.checked })} />
          {t("login.allowSelfSigned")}
        </label>
        <button className="btn-primary md:col-span-4" type="submit">{t("connections.save")}</button>
      </form>

      <DataTable
        columns={[t("provider.tableName"), t("connections.baseUrl"), t("connections.tls"), t("connections.status"), t("connections.actions")]}
        emptyMessage={t("common.empty")}
        rows={items.map((item) => [
          item.name,
          <code key={item.id}>{item.baseUrl}</code>,
          item.allowInsecureTls ? t("connections.insecureTls") : t("connections.strictTls"),
          item.id === activeId ? t("connections.active") : t("connections.idle"),
          <div key={`actions-${item.id}`} className="flex gap-3">
            <button
              className="text-sea"
              onClick={async () => {
                setActiveConnection(item.id);
                refresh();
                setStatus(t("connections.switched", { name: item.name }));
              }}
              type="button"
            >
              {t("connections.activate")}
            </button>
            <button
              className="text-amber-600"
              onClick={async () => {
                setActiveConnection(item.id);
                try {
                  const result = await probeConnection();
                  setStatus(t("connections.reachable", { name: item.name, service: result.service }));
                } catch (error) {
                  setStatus(error instanceof Error ? error.message : t("common.unknownError"));
                }
              }}
              type="button"
            >
              {t("connections.test")}
            </button>
            <button
              className="text-danger"
              onClick={() => {
                removeConnection(item.id);
                refresh();
              }}
              type="button"
            >
              {t("connections.delete")}
            </button>
          </div>,
        ])}
      />
    </Layout>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "connection";
}
