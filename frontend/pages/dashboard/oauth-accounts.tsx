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

type OAuthPlatform = {
  provider: string;
  label: string;
  authorization_endpoint: string;
  token_endpoint: string;
  default_scopes: string[];
  redirect_uri: string;
  notes: string;
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
  const [platforms, setPlatforms] = useState<OAuthPlatform[]>([]);
  const [form, setForm] = useState<OAuthAccount>(emptyForm);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [flow, setFlow] = useState({
    client_id: "",
    client_secret: "",
    authorization_endpoint: "",
    token_endpoint: "",
    scopes: "",
    redirect_uri: "",
    callback_url: "",
    code: "",
    auth_url: "",
  });

  async function load() {
    const [accounts, userList, platformList] = await Promise.all([
      apiRequest<OAuthAccount[]>(withAdminPath("/oauth-accounts")),
      apiRequest<User[]>(withAdminPath("/users")),
      apiRequest<OAuthPlatform[]>(withAdminPath("/oauth-platforms")),
    ]);
    setItems(accounts);
    setUsers(userList);
    setPlatforms(platformList);
    if (!form.user_id && userList[0]) {
      setForm((current) => ({ ...current, user_id: userList[0].id }));
    }
    if (platformList[0] && !flow.redirect_uri) {
      applyPlatform(platformList[0]);
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

  function applyPlatform(platform: OAuthPlatform) {
    setFlow((current) => ({
      ...current,
      authorization_endpoint: platform.authorization_endpoint || "",
      token_endpoint: platform.token_endpoint || "",
      scopes: (platform.default_scopes || []).join(" "),
      redirect_uri: platform.redirect_uri || "",
      auth_url: "",
    }));
  }

  async function handleGenerateLink() {
    const result = await apiRequest<{ auth_url?: string; redirect_uri: string; state: string; manual?: boolean; message?: string }>(
      withAdminPath("/oauth-flows/start"),
      "POST",
      {
        provider: form.provider,
        client_id: flow.client_id,
        authorization_endpoint: flow.authorization_endpoint,
        redirect_uri: flow.redirect_uri,
        scopes: flow.scopes.split(/\s+/).map((item) => item.trim()).filter(Boolean),
      }
    );
    setFlow((current) => ({ ...current, auth_url: result.auth_url || "", redirect_uri: result.redirect_uri }));
    setFeedback(result.manual ? (result.message || t("oauth.manualEndpoint")) : t("common.success"));
  }

  function handleParseCallback() {
    const parsed = parseOAuthCallback(flow.callback_url);
    if (!parsed) {
      setFeedback(t("common.unknownError"));
      return;
    }
    const code = parsed.get("code") || "";
    const accessToken = parsed.get("access_token") || "";
    const refreshToken = parsed.get("refresh_token") || "";
    setFlow((current) => ({ ...current, code: code || current.code }));
    setForm((current) => ({
      ...current,
      access_token: accessToken || current.access_token,
      refresh_token: refreshToken || current.refresh_token,
      provider_account_id: parsed.get("state") || current.provider_account_id,
      notes: code && !accessToken ? `${current.notes ? `${current.notes}\n` : ""}authorization_code=${code}` : current.notes,
    }));
    setFeedback(accessToken ? t("oauth.tokenCaptured") : t("oauth.codeCaptured"));
  }

  async function handleExchangeCode() {
    const result = await apiRequest<Record<string, string>>(withAdminPath("/oauth-flows/exchange"), "POST", {
      provider: form.provider,
      code: flow.code,
      client_id: flow.client_id,
      client_secret: flow.client_secret,
      token_endpoint: flow.token_endpoint,
      redirect_uri: flow.redirect_uri,
    });
    setForm((current) => ({
      ...current,
      access_token: result.access_token || current.access_token,
      refresh_token: result.refresh_token || current.refresh_token,
    }));
    setFeedback(t("oauth.tokenCaptured"));
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
        columns={[t("oauth.name"), t("oauth.provider"), t("oauth.email"), t("common.quota"), t("oauth.status"), t("common.actions")]}
        emptyMessage={t("common.empty")}
        rows={items.map((item) => [
          item.name || "-",
          item.provider,
          item.email || "-",
          `${item.quota_used}/${item.quota_total || 0} ${item.quota_unit || ""}`,
          item.status,
          <div key={item.id} className="flex flex-wrap gap-3">
            <button className="text-app-muted" onClick={() => { setForm(item); setOpen(true); }} type="button">{t("common.edit")}</button>
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
              {t("common.delete")}
            </button>
          </div>,
        ])}
      />

      <Modal
        closeLabel={t("common.close")}
        description={t("oauth.description")}
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
            <select
              className="field"
              value={form.provider}
              onChange={(event) => {
                const provider = event.target.value;
                setForm({ ...form, provider });
                const platform = platforms.find((item) => item.provider === provider);
                if (platform) {
                  applyPlatform(platform);
                }
              }}
            >
              {providerOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <div className="panel lg:col-span-2 p-4">
            <h3 className="text-base font-semibold text-app">{t("oauth.flowTitle")}</h3>
            <p className="mt-1 text-sm text-app-muted">{t("oauth.flowDescription")}</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-app">{t("oauth.clientId")}</span>
                <input className="field" value={flow.client_id} onChange={(event) => setFlow({ ...flow, client_id: event.target.value })} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-app">{t("oauth.clientSecret")}</span>
                <input className="field" type="password" value={flow.client_secret} onChange={(event) => setFlow({ ...flow, client_secret: event.target.value })} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-app">{t("oauth.authorizationEndpoint")}</span>
                <input className="field" value={flow.authorization_endpoint} onChange={(event) => setFlow({ ...flow, authorization_endpoint: event.target.value })} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-app">{t("oauth.tokenEndpoint")}</span>
                <input className="field" value={flow.token_endpoint} onChange={(event) => setFlow({ ...flow, token_endpoint: event.target.value })} />
              </label>
              <label className="grid gap-2 lg:col-span-2">
                <span className="text-sm font-medium text-app">{t("oauth.scopes")}</span>
                <input className="field" value={flow.scopes} onChange={(event) => setFlow({ ...flow, scopes: event.target.value })} />
              </label>
              <label className="grid gap-2 lg:col-span-2">
                <span className="text-sm font-medium text-app">{t("oauth.redirectUri")}</span>
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <input className="field" value={flow.redirect_uri} onChange={(event) => setFlow({ ...flow, redirect_uri: event.target.value })} />
                  <button className="btn-secondary" onClick={() => navigator.clipboard?.writeText(flow.redirect_uri)} type="button">{t("common.copy")}</button>
                </div>
              </label>
              <div className="grid gap-2 lg:col-span-2">
                <button className="btn-secondary" onClick={handleGenerateLink} type="button">{t("oauth.generateLink")}</button>
                {flow.auth_url ? (
                  <div className="rounded-[15px] border border-app p-3">
                    <p className="text-sm font-medium text-app">{t("oauth.authUrl")}</p>
                    <a className="mt-2 block break-all text-sm text-cyan-600" href={flow.auth_url} target="_blank" rel="noreferrer">{flow.auth_url}</a>
                  </div>
                ) : null}
              </div>
              <label className="grid gap-2 lg:col-span-2">
                <span className="text-sm font-medium text-app">{t("oauth.callbackUrl")}</span>
                <textarea className="field min-h-20" value={flow.callback_url} onChange={(event) => setFlow({ ...flow, callback_url: event.target.value })} />
              </label>
              <div className="flex flex-wrap gap-3 lg:col-span-2">
                <button className="btn-secondary" onClick={handleParseCallback} type="button">{t("oauth.parseCallback")}</button>
                <button className="btn-secondary" onClick={handleExchangeCode} type="button">{t("oauth.exchangeCode")}</button>
              </div>
            </div>
          </div>
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

function parseOAuthCallback(raw: string) {
  try {
    const url = new URL(raw.trim());
    const params = new URLSearchParams(url.search);
    if (url.hash) {
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      hash.forEach((value, key) => params.set(key, value));
    }
    return params;
  } catch {
    return null;
  }
}
