import { useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

type ProxyNode = {
  id?: string;
  type: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  region?: string;
  latency?: number;
  status: string;
};

const emptyForm: ProxyNode = { type: "http", host: "", port: 8080, username: "", password: "", region: "", latency: 0, status: "active" };

export default function ProxiesPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<ProxyNode[]>([]);
  const [form, setForm] = useState<ProxyNode>(emptyForm);
  const [open, setOpen] = useState(false);

  async function load() {
    const result = await apiRequest<ProxyNode[]>(withAdminPath("/proxy-nodes"));
    setItems(result);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Layout>
      <PageHeader
        title={t("proxies.title")}
        description={t("proxies.description")}
        action={<button className="btn-primary" onClick={() => setOpen(true)} type="button">{t("proxies.create")}</button>}
      />

      <DataTable
        columns={[t("proxies.type"), t("proxies.endpoint"), t("proxies.region"), t("proxies.latency"), t("common.status"), t("common.actions")]}
        emptyMessage={t("common.empty")}
        rows={items.map((item) => [
          item.type,
          `${item.host}:${item.port}`,
          item.region || "-",
          `${item.latency || 0} ms`,
          item.status,
          <button
            key={item.id}
            className="text-danger"
            onClick={async () => {
              await apiRequest(withAdminPath(`/proxy-nodes/${item.id}`), "DELETE");
              await load();
            }}
            type="button"
          >
            {t("common.delete")}
          </button>,
        ])}
      />

      <Modal closeLabel={t("common.close")} open={open} onClose={() => setOpen(false)} title={t("proxies.create")}>
        <div className="grid gap-4 md:grid-cols-3">
          <select className="field" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            <option value="http">http</option>
            <option value="socks5">socks5</option>
          </select>
          <input className="field" placeholder={t("proxies.host")} value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} />
          <input className="field" placeholder={t("proxies.port")} type="number" value={form.port} onChange={(event) => setForm({ ...form, port: Number(event.target.value) })} />
          <input className="field" placeholder={t("proxies.username")} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          <input className="field" placeholder={t("proxies.password")} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          <input className="field" placeholder={t("proxies.region")} value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setOpen(false)} type="button">{t("common.cancel")}</button>
          <button
            className="btn-primary"
            onClick={async () => {
              await apiRequest(withAdminPath("/proxy-nodes"), "POST", form);
              setForm(emptyForm);
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
