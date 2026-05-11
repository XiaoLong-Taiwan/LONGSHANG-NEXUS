import { FormEvent, useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";

type ProviderKey = {
  id?: string;
  provider: string;
  api_key: string;
  base_url?: string;
  priority: number;
  usage_count: number;
  status: string;
};

export default function ProviderKeysPage() {
  const [items, setItems] = useState<ProviderKey[]>([]);
  const [form, setForm] = useState<ProviderKey>({ provider: "openai", api_key: "", priority: 100, usage_count: 0, status: "active", base_url: "" });

  const load = () => apiRequest<ProviderKey[]>(withAdminPath("/provider-keys")).then(setItems);

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await apiRequest(withAdminPath("/provider-keys"), "POST", form);
    setForm({ provider: "openai", api_key: "", priority: 100, usage_count: 0, status: "active", base_url: "" });
    load();
  }

  return (
    <Layout>
      <PageHeader title="Provider Keys" description="Manage upstream API keys, priority, usage counts, and custom OpenAI-compatible base URLs." />
      <form className="panel grid gap-4 p-6 md:grid-cols-5" onSubmit={handleSubmit}>
        <select className="field" value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })}>
          <option value="openai">openai</option>
          <option value="anthropic">anthropic</option>
          <option value="gemini">gemini</option>
        </select>
        <input className="field md:col-span-2" placeholder="Provider API key" value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} />
        <input className="field" placeholder="Priority" type="number" value={form.priority} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })} />
        <input className="field" placeholder="Custom base URL" value={form.base_url} onChange={(event) => setForm({ ...form, base_url: event.target.value })} />
        <button className="btn-primary md:col-span-5" type="submit">Save provider key</button>
      </form>

      <DataTable
        columns={["Provider", "Priority", "Usage", "Status", "Base URL", "Action"]}
        rows={items.map((item) => [
          item.provider,
          item.priority,
          item.usage_count,
          item.status,
          item.base_url || "-",
          <button
            key={item.id}
            className="text-danger"
            onClick={async () => {
              await apiRequest(withAdminPath(`/provider-keys/${item.id}`), "DELETE");
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
