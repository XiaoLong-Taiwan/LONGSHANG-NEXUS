import { FormEvent, useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";

type ProxyNode = {
  id?: string;
  type: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  region?: string;
  latency?: number;
  status: string;
};

export default function ProxiesPage() {
  const [items, setItems] = useState<ProxyNode[]>([]);
  const [form, setForm] = useState<ProxyNode>({ type: "http", host: "", port: 8080, username: "", password: "", region: "", latency: 0, status: "active" });

  const load = () => apiRequest<ProxyNode[]>(withAdminPath("/proxy-nodes")).then(setItems);

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await apiRequest(withAdminPath("/proxy-nodes"), "POST", form);
    setForm({ type: "http", host: "", port: 8080, username: "", password: "", region: "", latency: 0, status: "active" });
    load();
  }

  return (
    <Layout>
      <PageHeader title="Proxy Nodes" description="Attach HTTP and SOCKS5 egress routes to API keys, OAuth accounts, and provider keys." />
      <form className="panel grid gap-4 p-6 md:grid-cols-3" onSubmit={handleSubmit}>
        <select className="field" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
          <option value="http">http</option>
          <option value="socks5">socks5</option>
        </select>
        <input className="field" placeholder="Host" value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} />
        <input className="field" placeholder="Port" type="number" value={form.port} onChange={(event) => setForm({ ...form, port: Number(event.target.value) })} />
        <input className="field" placeholder="Username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
        <input className="field" placeholder="Password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <input className="field" placeholder="Region" value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} />
        <button className="btn-primary md:col-span-3" type="submit">Add proxy node</button>
      </form>

      <DataTable
        columns={["Type", "Endpoint", "Region", "Latency", "Status", "Action"]}
        rows={items.map((item) => [
          item.type,
          `${item.host}:${item.port}`,
          item.region || "-",
          `${item.latency || 0} ms`,
          item.status,
          <button
            key={item.id}
            className="text-danger"
            onClick={async () => {
              await apiRequest(withAdminPath(`/proxy-nodes/${item.id}`), "DELETE");
              load();
            }}
          >
            Delete
          </button>,
        ])}
      />
    </Layout>
  );
}
