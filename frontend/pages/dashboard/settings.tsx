import { useEffect, useState } from "react";

import Layout from "../../components/Layout";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

const settingKeys = [
  "chaos_mode",
  "session_sticky_routing",
  "websocket_auth",
  "request_shaper",
  "thinking_signature_shaper",
  "thinking_budget_shaper",
  "api_key_signature_shaper",
  "request_fingerprint_normalization",
  "metadata_passthrough",
  "cch_signature",
  "anthropic_cache_ttl_injection",
  "rewrite_message_cache_breakpoints",
] as const;

type SettingsState = Record<(typeof settingKeys)[number], boolean>;

export default function SettingsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest<SettingsState>(withAdminPath("/settings"))
      .then(setSettings)
      .catch((error) => setFeedback(error instanceof Error ? error.message : "Failed to load settings"));
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      await apiRequest(withAdminPath("/settings"), "PUT", settings);
      setFeedback(t("settings.saved"));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <PageHeader
        title={t("settings.title")}
        description={t("settings.description")}
        action={<button className="btn-primary" disabled={saving} onClick={handleSave} type="button">{saving ? t("common.saving") : t("common.save")}</button>}
      />

      {feedback ? <div className="alert-info">{feedback}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {settingKeys.map((key) => (
          <label key={key} className="panel flex items-center gap-4 p-5">
            <input
              checked={Boolean(settings?.[key])}
              onChange={(event) => setSettings((current) => current ? { ...current, [key]: event.target.checked } : current)}
              type="checkbox"
            />
            <div>
              <p className="font-semibold text-app">{t(`settings.${key}`)}</p>
              <p className="mt-1 text-sm text-app-muted">{key}</p>
            </div>
          </label>
        ))}
      </div>
    </Layout>
  );
}
