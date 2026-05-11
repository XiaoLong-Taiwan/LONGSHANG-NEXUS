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

export default function ModelsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<ModelRecord[]>([]);

  const load = () => apiRequest<ModelRecord[]>(withAdminPath("/models")).then(setItems);

  useEffect(() => {
    load();
  }, []);

  return (
    <Layout>
      <PageHeader
        title={t("models.title")}
        description={t("models.description")}
        action={
          <div className="flex gap-3">
            <button
              className="btn-secondary"
              onClick={async () => {
                await apiRequest(withAdminPath("/provider-keys/detect-models"), "POST");
                load();
              }}
            >
              {t("models.detectAll")}
            </button>
            <button
              className="btn-primary"
              onClick={async () => {
                await apiRequest(withAdminPath("/models/sync"), "POST");
                load();
              }}
            >
              {t("models.syncAll")}
            </button>
          </div>
        }
      />

      <DataTable
        columns={["Provider", "Model", "Type", "Priority", "Status", "Last checked"]}
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
