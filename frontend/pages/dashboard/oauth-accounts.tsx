import { useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

type OAuthAccount = {
  id?: string;
  name: string;
  provider: string;
  email: string;
  provider_account_id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  status: string;
  quota_used: number;
  quota_total: number;
  quota_unit: string;
  notes: string;
  proxy_id?: string | null;
};

type User = {
  id: string;
  email: string;
};

const providerOptions = ["codex", "anthropic", "antigravity", "gemini-cli", "kimi", "google", "github"];

const emptyForm: OAuthAccount = {
  name: "",
  provider: "codex",
  email: "",
  provider_account_id: "",
  user_id: "",
  access_token: "",
  refresh_token: "",
  status: "active",
  quota_used: 0,
  quota_total: 0,
  quota_unit: "requests",
  notes: "",
  proxy_id: "",
};

export default function OAuthAccountsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<OAuthAccount[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<OAuthAccount>(emptyForm);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function load() {
    const [accounts, userList] = await Promise.all([
      apiRequest<OAuthAccount[]>(withAdminPath("/oauth-accounts")),
      apiRequest<User[]>(withAdminPath("/users")),
    ]);
    setItems(accounts);
    setUsers(userList);
    if (!form.user_id && userList[0]) {
      setForm((current) => ({ ...current, user_id: userList[0].id }));
    }
  }

  useEffect(() => {
    load().catch((error) => setFeedback(error instanceof Error ? error.message : "Failed to load"));
  }, []);

  async function handleSave() {
    const path = form.id ? withAdminPath(`/oauth-accounts/${form.id}`) : withAdminPath("/oauth-accounts");
    const method: "PUT" | "POST" = form.id ? "PUT" : "POST";
    await apiRequest(path, method, { ...form, proxy_id: form.proxy_id || null });
    setFeedback(t("oauth.saved"));
    setOpen(false);
    setForm(emptyForm);
    await load();
  }

  return (
    <Layout>
      <PageHeader
        title={t("oauth.title")}
        description={t("oauth.description")}
        action={<button className="btn-primary" onClick={() => setOpen(true)} type="button">{t("oauth.add")}</button>}
      />

      {feedback ? <div className="alert-info">{feedback}</div> : null}

      <DataTable
        columns={[t("oauth.name"), t("oauth.provider"), t("oauth.email"), "Quota", t("oauth.status"), "Actions"]}
        emptyMessage={t("common.empty")}
        rows={items.map((item) => [
          item.name || "-",
          item.provider,
          item.email || "-",
          `${item.quota_used}/${item.quota_total || 0} ${item.quota_unit || ""}`,
          item.status,
          <div key={item.id} className="flex flex-wrap gap-3">
            <button className="text-app-muted" onClick={() => { setForm(item); setOpen(true); }} type="button">Edit</button>
            <button
              className="text-app-muted"
              onClick={async () => {
                await apiRequest(withAdminPath(`/oauth-accounts/${item.id}/detect-quota`), "POST");
                await load();
              }}
              type="button"
            >
              {t("oauth.detectQuota")}
            </button>
            <button
              className="text-danger"
              onClick={async () => {
                await apiRequest(withAdminPath(`/oauth-accounts/${item.id}`), "DELETE");
                setFeedback(t("oauth.deleted"));
                await load();
              }}
              type="button"
            >
              Delete
            </button>
          </div>,
        ])}
      />

      <Modal
        closeLabel={t("common.close")}
        description="Import tokens from Codex OAuth, Anthropic OAuth, Antigravity OAuth, Gemini CLI OAuth, Kimi OAuth, or other supported flows."
        open={open}
        onClose={() => { setOpen(false); setForm(emptyForm); }}
        title={form.id ? t("oauth.modalEdit") : t("oauth.modalCreate")}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("oauth.name")}</span>
            <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("oauth.provider")}</span>
            <select className="field" value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })}>
              {providerOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("oauth.email")}</span>
            <input className="field" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("oauth.accountId")}</span>
            <input className="field" value={form.provider_account_id} onChange={(event) => setForm({ ...form, provider_account_id: event.target.value })} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("oauth.user")}</span>
            <select className="field" value={form.user_id} onChange={(event) => setForm({ ...form, user_id: event.target.value })}>
              {users.map((item) => <option key={item.id} value={item.id}>{item.email}</option>)}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("oauth.status")}</span>
            <select className="field" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium text-app">{t("oauth.accessToken")}</span>
            <textarea className="field min-h-24" value={form.access_token} onChange={(event) => setForm({ ...form, access_token: event.target.value })} />
          </label>
          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium text-app">{t("oauth.refreshToken")}</span>
            <textarea className="field min-h-20" value={form.refresh_token} onChange={(event) => setForm({ ...form, refresh_token: event.target.value })} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("oauth.quotaUsed")}</span>
            <input className="field" type="number" value={form.quota_used} onChange={(event) => setForm({ ...form, quota_used: Number(event.target.value) })} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("oauth.quotaTotal")}</span>
            <input className="field" type="number" value={form.quota_total} onChange={(event) => setForm({ ...form, quota_total: Number(event.target.value) })} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-app">{t("oauth.quotaUnit")}</span>
            <input className="field" value={form.quota_unit} onChange={(event) => setForm({ ...form, quota_unit: event.target.value })} />
          </label>
          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium text-app">{t("oauth.notes")}</span>
            <textarea className="field min-h-24" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => { setOpen(false); setForm(emptyForm); }} type="button">{t("common.cancel")}</button>
          <button className="btn-primary" onClick={handleSave} type="button">{t("common.save")}</button>
        </div>
      </Modal>
    </Layout>
  );
}
