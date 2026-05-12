import { useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

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
  const { t } = useI18n();
  const [items, setItems] = useState<ApiKey[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [rawKey, setRawKey] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ user_id: "", rate_limit: 120, allowed_models: "gpt-4o-mini,claude-3-5-sonnet-latest" });

  async function load() {
    const [apiKeys, userList] = await Promise.all([
      apiRequest<ApiKey[]>(withAdminPath("/api-keys")),
      apiRequest<User[]>(withAdminPath("/users")),
    ]);
    setItems(apiKeys);
    setUsers(userList);
    if (!form.user_id && userList[0]) {
      setForm((current) => ({ ...current, user_id: userList[0].id }));
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Layout>
      <PageHeader
        title={t("apiKeys.title")}
        description={t("apiKeys.description")}
        action={<button className="btn-primary" onClick={() => setOpen(true)} type="button">{t("apiKeys.create")}</button>}
      />

      {rawKey ? (
        <div className="panel p-6">
          <p className="text-sm text-app-muted">{t("apiKeys.newSecret")}</p>
          <code className="mt-3 block overflow-auto rounded-[15px] border border-app px-4 py-4 text-sm text-app">{rawKey}</code>
        </div>
      ) : null}

      <DataTable
        columns={[t("apiKeys.preview"), t("apiKeys.user"), t("apiKeys.rateLimit"), t("apiKeys.status"), t("apiKeys.created"), t("common.actions")]}
        emptyMessage={t("common.empty")}
        rows={items.map((item) => [
          <code key={item.id}>{item.key_preview}</code>,
          item.user_id,
          `${item.rate_limit || 60}/min`,
          item.status,
          new Date(item.created_at).toLocaleString(),
          <div key={`actions-${item.id}`} className="flex gap-3">
            <button
              className="text-app-muted"
              onClick={async () => {
                const result = await apiRequest<{ raw_key: string }>(withAdminPath(`/api-keys/${item.id}/rotate`), "POST");
                setRawKey(result.raw_key);
                await load();
              }}
              type="button"
            >
              {t("apiKeys.rotate")}
            </button>
            <button
              className="text-app-muted"
              onClick={async () => {
                await apiRequest(withAdminPath(`/api-keys/${item.id}/disable`), "POST");
                await load();
              }}
              type="button"
            >
              {t("apiKeys.disable")}
            </button>
            <button
              className="text-danger"
              onClick={async () => {
                await apiRequest(withAdminPath(`/api-keys/${item.id}`), "DELETE");
                await load();
              }}
              type="button"
            >
              {t("common.delete")}
            </button>
          </div>,
        ])}
      />

      <Modal closeLabel={t("common.close")} open={open} onClose={() => setOpen(false)} title={t("apiKeys.create")}>
        <div className="grid gap-4 md:grid-cols-3">
          <select className="field" value={form.user_id} onChange={(event) => setForm({ ...form, user_id: event.target.value })}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.email}</option>
            ))}
          </select>
          <input className="field" value={form.rate_limit} onChange={(event) => setForm({ ...form, rate_limit: Number(event.target.value) })} type="number" placeholder={t("apiKeys.rateLimit")} />
          <input className="field" value={form.allowed_models} onChange={(event) => setForm({ ...form, allowed_models: event.target.value })} placeholder={t("apiKeys.allowedModels")} />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setOpen(false)} type="button">{t("common.cancel")}</button>
          <button
            className="btn-primary"
            onClick={async () => {
              const result = await apiRequest<{ raw_key: string }>(withAdminPath("/api-keys"), "POST", {
                user_id: form.user_id,
                rate_limit: Number(form.rate_limit),
                allowed_models: form.allowed_models.split(",").map((item) => item.trim()).filter(Boolean),
              });
              setRawKey(result.raw_key);
              setOpen(false);
              await load();
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
