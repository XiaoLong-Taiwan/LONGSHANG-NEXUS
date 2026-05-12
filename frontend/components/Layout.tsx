import Link from "next/link";
import { useRouter } from "next/router";
import { PropsWithChildren, useEffect, useState } from "react";

import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";
import { clearToken, currentUser, getToken } from "../lib/api";
import { getActiveConnection, loadConnections, setActiveConnection } from "../lib/connections";
import { useI18n } from "../lib/i18n";

export default function Layout({ children }: PropsWithChildren) {
  const router = useRouter();
  const { t } = useI18n();
  const [connectionName, setConnectionName] = useState("Backend");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeConnectionId, setActiveConnectionId] = useState("");
  const connections = loadConnections();
  const navItems = [
    { href: "/dashboard", label: t("nav.overview") },
    { href: "/dashboard/connections", label: t("nav.connections") },
    { href: "/dashboard/users", label: t("nav.users") },
    { href: "/dashboard/api-keys", label: t("nav.apiKeys") },
    { href: "/dashboard/provider-keys", label: t("nav.providerKeys") },
    { href: "/dashboard/proxies", label: t("nav.proxies") },
    { href: "/dashboard/oauth-accounts", label: t("nav.oauthAccounts") },
    { href: "/dashboard/models", label: t("nav.models") },
    { href: "/dashboard/usage", label: t("nav.usage") },
    { href: "/dashboard/settings", label: t("nav.settings") },
  ];

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    const active = getActiveConnection();
    setConnectionName(active.name);
    setActiveConnectionId(active.id);
    currentUser()
      .then((result) => {
        if (result.user.role !== "admin") {
          clearToken();
          router.replace("/?error=admin");
        }
      })
      .catch(() => {
        clearToken();
        router.replace("/?error=session");
      });
  }, [router]);

  return (
    <div className="min-h-screen px-3 py-3 md:px-5 md:py-5">
      <div className="mx-auto flex max-w-[1680px] gap-4">
        <aside className={`panel-strong fixed inset-y-3 left-3 z-40 w-[280px] overflow-hidden transition md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-[120%]"
        }`}>
          <div className="flex h-full flex-col">
            <div className="border-b border-app px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-app-muted">AI Gateway</p>
                  <h1 className="mt-2 text-2xl font-semibold text-app">{t("layout.title")}</h1>
                </div>
                <button className="btn-secondary md:hidden" onClick={() => setMobileOpen(false)} type="button">
                  {t("common.close")}
                </button>
              </div>
              <p className="mt-3 text-sm text-app-muted">{t("layout.subtitle")}</p>
            </div>

            <div className="border-b border-app px-5 py-4">
              <p className="text-xs uppercase tracking-[0.24em] text-app-muted">{t("layout.connectedBackend")}</p>
              <select
                className="field mt-3"
                value={activeConnectionId}
                onChange={(event) => {
                  setActiveConnectionId(event.target.value);
                  setActiveConnection(event.target.value);
                  const next = connections.find((item) => item.id === event.target.value);
                  if (next) {
                    setConnectionName(next.name);
                  }
                }}
              >
                {connections.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {navItems.map((item) => {
                const active = router.pathname === item.href;
                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    className={`block rounded-[15px] px-4 py-3 text-sm font-medium transition ${
                      active
                        ? "bg-cyan-600 text-white"
                        : "text-app-muted hover:bg-white/10 hover:text-app"
                    }`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-app px-4 py-4">
              <button
                className="btn-secondary w-full"
                onClick={() => {
                  clearToken();
                  router.push("/");
                }}
                type="button"
              >
                {t("layout.signOut")}
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="panel-strong sticky top-3 z-30 flex flex-col gap-3 px-4 py-4 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button className="btn-secondary md:hidden" onClick={() => setMobileOpen(true)} type="button">
                  Menu
                </button>
                <div>
                  <p className="text-sm font-semibold text-app">{connectionName}</p>
                  <p className="text-xs text-app-muted">{t("layout.connectedBackend")}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ThemeToggle />
                <LanguageSwitcher />
              </div>
            </div>
          </header>

          <main className="min-w-0 space-y-4">{children}</main>
        </div>
      </div>

      {mobileOpen ? (
        <button
          className="fixed inset-0 z-30 bg-slate-950/35 md:hidden"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}
    </div>
  );
}
