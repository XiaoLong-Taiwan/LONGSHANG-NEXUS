import { useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import Modal from "../../components/Modal";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

type User = {
  id?: string;
  email: string;
  role: string;
  created_at?: string;
  password?: string;
};

const emptyForm: User = { email: "", password: "", role: "user" };

export default function UsersPage() {
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<User>(emptyForm);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function load() {
    const result = await apiRequest<User[]>(withAdminPath("/users"));
    setUsers(result);
  }

  useEffect(() => {
    load().catch((error) => setFeedback(error instanceof Error ? error.message : "Failed to load"));
  }, []);

  return (
    <Layout>
      <PageHeader
        title={t("users.title")}
        description={t("users.description")}
        action={<button className="btn-primary" onClick={() => setOpen(true)} type="button">{t("users.create")}</button>}
      />
      {feedback ? <div className="alert-info">{feedback}</div> : null}
      <DataTable
        columns={[t("users.email"), t("users.role"), t("users.created"), t("common.actions")]}
        emptyMessage={t("common.empty")}
        rows={users.map((user) => [
          user.email,
          user.role,
          user.created_at ? new Date(user.created_at).toLocaleString() : "-",
          <button
            key={user.id}
            className="text-danger"
            onClick={async () => {
              await apiRequest(withAdminPath(`/users/${user.id}`), "DELETE");
              await load();
            }}
            type="button"
          >
            {t("common.delete")}
          </button>,
        ])}
      />
      <Modal
        closeLabel={t("common.close")}
        open={open}
        onClose={() => { setOpen(false); setForm(emptyForm); }}
        title={t("users.create")}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <input className="field" placeholder={t("users.email")} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <input className="field" placeholder={t("users.password")} type="password" value={form.password || ""} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          <select className="field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setOpen(false)} type="button">{t("common.cancel")}</button>
          <button
            className="btn-primary"
            onClick={async () => {
              await apiRequest(withAdminPath("/users"), "POST", form);
              setOpen(false);
              setForm(emptyForm);
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
