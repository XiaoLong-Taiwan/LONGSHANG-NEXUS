import Link from "next/link";
import { useRouter } from "next/router";
import { PropsWithChildren, useEffect, useState } from "react";

import LanguageSwitcher from "./LanguageSwitcher";
import { clearToken, currentUser, getToken } from "../lib/api";
import { getActiveConnection } from "../lib/connections";
import { useI18n } from "../lib/i18n";

export default function Layout({ children }: PropsWithChildren) {
  const router = useRouter();
  const [connectionName, setConnectionName] = useState("Backend");
  const { t } = useI18n();
  const navItems = [
    { href: "/dashboard", label: t("nav.overview") },
    { href: "/dashboard/connections", label: t("nav.connections") },
    { href: "/dashboard/users", label: t("nav.users") },
    { href: "/dashboard/api-keys", label: t("nav.apiKeys") },
    { href: "/dashboard/provider-keys", label: t("nav.providerKeys") },
    { href: "/dashboard/proxies", label: t("nav.proxies") },
    { href: "/dashboard/models", label: t("nav.models") },
    { href: "/dashboard/usage", label: t("nav.usage") },
  ];

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    setConnectionName(getActiveConnection().name);
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
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="panel overflow-hidden">
          <div className="bg-ink px-6 py-8 text-white">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs uppercase tracking-[0.32em] text-white/60">AI Gateway</p>
              <LanguageSwitcher />
            </div>
            <h1 className="mt-3 text-3xl font-semibold">{t("layout.title")}</h1>
            <p className="mt-3 text-sm text-white/70">{t("layout.subtitle")}</p>
            <div className="mt-5 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white/85">
              {t("layout.connectedBackend")}: <span className="font-semibold">{connectionName}</span>
            </div>
          </div>
          <nav className="space-y-2 p-4">
            {navItems.map((item) => {
              const active = router.pathname === item.href;
              return (
                <Link
                  href={item.href}
                  key={item.href}
                  className={`block rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-4 pt-0">
            <button
              className="btn-secondary w-full"
              onClick={() => {
                clearToken();
                router.push("/");
              }}
            >
              {t("layout.signOut")}
            </button>
          </div>
        </aside>

        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
