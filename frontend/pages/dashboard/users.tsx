import { FormEvent, useEffect, useState } from "react";

import DataTable from "../../components/DataTable";
import Layout from "../../components/Layout";
import PageHeader from "../../components/PageHeader";
import { apiRequest, withAdminPath } from "../../lib/api";

type User = {
  id: string;
  email: string;
  role: string;
  created_at: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ email: "", password: "", role: "user" });
  const [error, setError] = useState("");

  const load = () => apiRequest<User[]>(withAdminPath("/users")).then(setUsers).catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await apiRequest(withAdminPath("/users"), "POST", form);
    setForm({ email: "", password: "", role: "user" });
    load();
  }

  return (
    <Layout>
      <PageHeader title="Users" description="Manage admin and user identities for the gateway." />
      {error ? <div className="panel p-6 text-danger">{error}</div> : null}
      <form className="panel grid gap-4 p-6 md:grid-cols-4" onSubmit={handleSubmit}>
        <input className="field" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <input className="field" placeholder="Password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <select className="field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button className="btn-primary" type="submit">Create user</button>
      </form>

      <DataTable
        columns={["Email", "Role", "Created", "Action"]}
        rows={users.map((user) => [
          user.email,
          user.role,
          new Date(user.created_at).toLocaleString(),
          <button
            key={user.id}
            className="text-danger"
            onClick={async () => {
              await apiRequest(withAdminPath(`/users/${user.id}`), "DELETE");
              load();
            }}
          >
            Delete
          </button>,
        ])}
      />
    </Layout>
  );
}
