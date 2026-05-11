import { FormEvent, useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";

type ApiKey = {
  id: string;
  user_id: string;
  key_preview: string;
  status: string;
  rate_limit: number;
  created_at: string;
};

type User = {
  id: string;
  email: string;
};

export default function APIKeysPage() {
  const [items, setItems] = useState<ApiKey[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [rawKey, setRawKey] = useState("");
  const [form, setForm] = useState({ user_id: "", rate_limit: 120, allowed_models: "gpt-4o-mini,claude-3-5-sonnet-latest" });

  const load = async () => {
    const [apiKeys, userList] = await Promise.all([
      apiRequest<ApiKey[]>(withAdminPath("/api-keys")),
      apiRequest<User[]>(withAdminPath("/users")),
    ]);
    setItems(apiKeys);
    setUsers(userList);
    if (!form.user_id && userList[0]) {
      setForm((current) => ({ ...current, user_id: userList[0].id }));
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await apiRequest<{ raw_key: string }>(withAdminPath("/api-keys"), "POST", {
      user_id: form.user_id,
      rate_limit: Number(form.rate_limit),
      allowed_models: form.allowed_models.split(",").map((item) => item.trim()).filter(Boolean),
    });
    setRawKey(result.raw_key);
    load();
  }

  return (
    <Layout>
      <PageHeader title="API Keys" description="Issue, rotate, disable, and scope keys by model policy and rate limit." />

      {rawKey ? (
        <div className="panel p-6">
          <p className="text-sm text-slate-500">New secret key</p>
          <code className="mt-2 block overflow-auto rounded-2xl bg-slate-950 px-4 py-4 text-sm text-white">{rawKey}</code>
        </div>
      ) : null}

      <form className="panel grid gap-4 p-6 md:grid-cols-4" onSubmit={handleSubmit}>
        <select className="field" value={form.user_id} onChange={(event) => setForm({ ...form, user_id: event.target.value })}>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.email}</option>
          ))}
        </select>
        <input className="field" value={form.rate_limit} onChange={(event) => setForm({ ...form, rate_limit: Number(event.target.value) })} type="number" placeholder="Rate limit / min" />
        <input className="field md:col-span-2" value={form.allowed_models} onChange={(event) => setForm({ ...form, allowed_models: event.target.value })} placeholder="Comma-separated models" />
        <button className="btn-primary md:col-span-4" type="submit">Create API key</button>
      </form>

      <DataTable
        columns={["Preview", "User", "Rate limit", "Status", "Created", "Actions"]}
        rows={items.map((item) => [
          <code key={item.id}>{item.key_preview}</code>,
          item.user_id,
          `${item.rate_limit || 60}/min`,
          item.status,
          new Date(item.created_at).toLocaleString(),
          <div key={`actions-${item.id}`} className="flex gap-3">
            <button
              className="text-sea"
              onClick={async () => {
                const result = await apiRequest<{ raw_key: string }>(withAdminPath(`/api-keys/${item.id}/rotate`), "POST");
                setRawKey(result.raw_key);
                load();
              }}
            >
              Rotate
            </button>
            <button
              className="text-amber-600"
              onClick={async () => {
                await apiRequest(withAdminPath(`/api-keys/${item.id}/disable`), "POST");
                load();
              }}
            >
              Disable
            </button>
            <button
              className="text-danger"
              onClick={async () => {
                await apiRequest(withAdminPath(`/api-keys/${item.id}`), "DELETE");
                load();
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
