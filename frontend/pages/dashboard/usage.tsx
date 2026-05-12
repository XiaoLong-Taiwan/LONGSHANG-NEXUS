import { useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

type UsageLog = {
  id: string;
  provider: string;
  model: string;
  tokens: number;
  latency: number;
  status_code: number;
  error_message: string;
  created_at: string;
};

export default function UsagePage() {
  const { t } = useI18n();
  const [items, setItems] = useState<UsageLog[]>([]);

  useEffect(() => {
    apiRequest<UsageLog[]>(withAdminPath("/usage")).then(setItems);
  }, []);

  return (
    <Layout>
      <PageHeader title={t("nav.usage")} description="Recent request telemetry used to drive monitoring, performance debugging, and cost visibility." />
      <DataTable
        columns={["Provider", "Model", "Tokens", "Latency", "Status", "Created", "Error"]}
        emptyMessage={t("common.empty")}
        rows={items.map((item) => [
          item.provider || "-",
          item.model,
          item.tokens,
          `${item.latency} ms`,
          item.status_code,
          new Date(item.created_at).toLocaleString(),
          item.error_message || "-",
        ])}
      />
    </Layout>
  );
}
