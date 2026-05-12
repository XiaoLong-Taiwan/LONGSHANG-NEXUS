import { useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

type ModelRecord = {
  id: string;
  provider: string;
  model_name: string;
  type: string;
  priority: number;
  status: string;
  last_checked: string;
};

type Feedback = {
  type: "success" | "error";
  message: string;
} | null;

export default function ModelsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<ModelRecord[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busyAction, setBusyAction] = useState<"" | "detect" | "sync">("");

  const load = () => apiRequest<ModelRecord[]>(withAdminPath("/models")).then(setItems);

  useEffect(() => {
    load().catch((error) => setFeedback({ type: "error", message: toMessage(error, t("common.unknownError")) }));
  }, [t]);

  async function handleDetectAll() {
    setBusyAction("detect");
    setFeedback(null);
    try {
      await apiRequest(withAdminPath("/provider-keys/detect-models"), "POST");
      await load();
      setFeedback({ type: "success", message: t("models.detectSuccess") });
    } catch (error) {
      setFeedback({ type: "error", message: toMessage(error, t("common.unknownError")) });
    } finally {
      setBusyAction("");
    }
  }

  async function handleSyncAll() {
    setBusyAction("sync");
    setFeedback(null);
    try {
      await apiRequest(withAdminPath("/models/sync"), "POST");
      await load();
      setFeedback({ type: "success", message: t("models.syncSuccess") });
    } catch (error) {
      setFeedback({ type: "error", message: toMessage(error, t("common.unknownError")) });
    } finally {
      setBusyAction("");
    }
  }

  return (
    <Layout>
      <PageHeader
        title={t("models.title")}
        description={t("models.description")}
        action={
          <div className="flex flex-wrap gap-3">
            <button className="btn-secondary" disabled={busyAction !== ""} onClick={handleDetectAll} type="button">
              {busyAction === "detect" ? t("common.testing") : t("models.detectAll")}
            </button>
            <button className="btn-primary" disabled={busyAction !== ""} onClick={handleSyncAll} type="button">
              {busyAction === "sync" ? t("common.saving") : t("models.syncAll")}
            </button>
          </div>
        }
      />

      {feedback ? <div className={feedback.type === "error" ? "alert-error" : "alert-success"}>{feedback.message}</div> : null}

      <DataTable
        columns={[
          t("models.provider"),
          t("models.model"),
          t("models.type"),
          t("models.priority"),
          t("models.status"),
          t("models.lastChecked"),
        ]}
        emptyMessage={t("common.empty")}
        rows={items.map((item) => [
          item.provider,
          <code key={item.id}>{item.model_name}</code>,
          item.type,
          item.priority,
          item.status,
          item.last_checked ? new Date(item.last_checked).toLocaleString() : "-",
        ])}
      />
    </Layout>
  );
}

function toMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
