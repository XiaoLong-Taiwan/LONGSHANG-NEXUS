import { useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

type AggregateModel = {
  model_name: string;
  providers: string[];
  types: string[];
  priority: number;
  status: string;
  last_checked: string;
  upstreams: Array<{
    provider: string;
    integration_id: string;
    integration_name: string;
    source: string;
  }>;
};

export default function ModelsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<AggregateModel[]>([]);
  const [detail, setDetail] = useState<AggregateModel | null>(null);
  const [feedback, setFeedback] = useState("");

  async function load() {
    const result = await apiRequest<AggregateModel[]>(withAdminPath("/models/aggregate"));
    setItems(result);
  }

  useEffect(() => {
    load().catch((error) => setFeedback(error instanceof Error ? error.message : "Failed to load"));
  }, []);

  return (
    <Layout>
      <PageHeader
        title={t("models.title")}
        description={t("models.description")}
        action={
          <button
            className="btn-primary"
            onClick={async () => {
              await apiRequest(withAdminPath("/models/sync"), "POST");
              await load();
              setFeedback(t("models.syncSuccess"));
            }}
            type="button"
          >
            {t("models.syncAll")}
          </button>
        }
      />

      {feedback ? <div className="alert-info">{feedback}</div> : null}

      <DataTable
        columns={[t("models.model"), t("models.provider"), t("models.type"), t("models.upstreams"), t("models.lastChecked"), t("common.actions")]}
        emptyMessage={t("common.empty")}
        rows={items.map((item) => [
          <code key={item.model_name}>{item.model_name}</code>,
          item.providers.join(", "),
          item.types.join(", "),
          item.upstreams.length,
          item.last_checked ? new Date(item.last_checked).toLocaleString() : "-",
          <button className="text-app-muted" onClick={() => setDetail(item)} type="button">{t("models.view")}</button>,
        ])}
      />

      <Modal
        closeLabel={t("common.close")}
        description={t("models.detailDescription")}
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.model_name || t("models.detail")}
      >
        <div className="grid gap-3">
          {(detail?.upstreams || []).map((item) => (
            <div key={`${item.provider}-${item.integration_id}-${item.source}`} className="rounded-[15px] border border-app px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-app">{item.integration_name || item.provider}</p>
                <span className="badge-muted">{item.source}</span>
              </div>
              <p className="mt-2 text-sm text-app-muted">{item.provider}</p>
            </div>
          ))}
        </div>
      </Modal>
    </Layout>
  );
}
