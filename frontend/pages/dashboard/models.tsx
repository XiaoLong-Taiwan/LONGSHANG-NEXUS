import { useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";

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
  const [items, setItems] = useState<ModelRecord[]>([]);

  const load = () => apiRequest<ModelRecord[]>(withAdminPath("/models")).then(setItems);

  useEffect(() => {
    load();
  }, []);

  return (
    <Layout>
      <PageHeader
        title="Model Registry"
        description="Provider model catalog used for routing, sync status, and OpenAI-compatible model exposure."
        action={
          <button
            className="btn-primary"
            onClick={async () => {
              await apiRequest(withAdminPath("/models/sync"), "POST");
              load();
            }}
          >
            Sync models now
          </button>
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
