import { FormEvent, useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import PageHeader from "../../components/PageHeader";
import { probeConnection } from "../../lib/api";
import { getActiveConnection, loadConnections, removeConnection, setActiveConnection, upsertConnection, type BackendConnection } from "../../lib/connections";

const emptyForm: BackendConnection = {
  id: "",
  name: "",
  baseUrl: "http://localhost:18437",
  allowInsecureTls: false,
};

export default function ConnectionsPage() {
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
  }

  return (
    <Layout>
      <PageHeader title="Connections" description="Manage multiple backend gateways. Each browser session can switch between backend nodes without redeploying the frontend." />

      {status ? <div className="panel p-6 text-slate-700">{status}</div> : null}

      <form className="panel grid gap-4 p-6 md:grid-cols-4" onSubmit={handleSubmit}>
        <input className="field" placeholder="Connection name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input className="field md:col-span-2" placeholder="Backend base URL" value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} />
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <input type="checkbox" checked={form.allowInsecureTls} onChange={(event) => setForm({ ...form, allowInsecureTls: event.target.checked })} />
          Allow self-signed HTTPS
        </label>
        <button className="btn-primary md:col-span-4" type="submit">Save connection</button>
      </form>

      <DataTable
        columns={["Name", "Base URL", "TLS", "Status", "Actions"]}
        rows={items.map((item) => [
          item.name,
          <code key={item.id}>{item.baseUrl}</code>,
          item.allowInsecureTls ? "self-signed allowed" : "strict",
          item.id === activeId ? "active" : "idle",
          <div key={`actions-${item.id}`} className="flex gap-3">
            <button
              className="text-sea"
              onClick={async () => {
                setActiveConnection(item.id);
                refresh();
                setStatus(`Active backend switched to ${item.name}`);
              }}
            >
              Activate
            </button>
            <button
              className="text-amber-600"
              onClick={async () => {
                setActiveConnection(item.id);
                try {
                  const result = await probeConnection();
                  setStatus(`${item.name} reachable: ${result.service}`);
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : "Connection test failed");
                }
              }}
            >
              Test
            </button>
            <button
              className="text-danger"
              onClick={() => {
                removeConnection(item.id);
                refresh();
              }}
            >
              Delete
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
