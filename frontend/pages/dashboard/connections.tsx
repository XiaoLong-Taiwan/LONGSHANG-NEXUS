import { useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import Modal from "../../components/Modal";
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
  const [open, setOpen] = useState(false);

  function refresh() {
    const connections = loadConnections();
    const active = getActiveConnection();
    setItems(connections);
    setActiveId(active.id);
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <Layout>
      <PageHeader
        title={t("connections.title")}
        description={t("connections.description")}
        action={<button className="btn-primary" onClick={() => setOpen(true)} type="button">{t("connections.save")}</button>}
      />

      {status ? <div className="alert-info">{status}</div> : null}

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
              className="text-app-muted"
              onClick={() => {
                setActiveConnection(item.id);
                refresh();
                setStatus(t("connections.switched", { name: item.name }));
              }}
              type="button"
            >
              {t("connections.activate")}
            </button>
            <button
              className="text-app-muted"
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

      <Modal closeLabel={t("common.close")} open={open} onClose={() => setOpen(false)} title={t("connections.save")}>
        <div className="grid gap-4">
          <input className="field" placeholder={t("connections.name")} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input className="field" placeholder={t("connections.baseUrl")} value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} />
          <label className="flex items-center gap-3 rounded-[15px] border border-app px-4 py-3 text-sm text-app">
            <input type="checkbox" checked={form.allowInsecureTls} onChange={(event) => setForm({ ...form, allowInsecureTls: event.target.checked })} />
            {t("login.allowSelfSigned")}
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setOpen(false)} type="button">{t("common.cancel")}</button>
          <button
            className="btn-primary"
            onClick={() => {
              const connection = {
                ...form,
                id: form.id || slugify(form.name || form.baseUrl),
              };
              upsertConnection(connection);
              setActiveConnection(connection.id);
              setForm(emptyForm);
              setOpen(false);
              refresh();
              setStatus(t("connections.saved", { name: connection.name }));
            }}
            type="button"
          >
            {t("common.save")}
          </button>
        </div>
      </Modal>
    </Layout>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "connection";
}
