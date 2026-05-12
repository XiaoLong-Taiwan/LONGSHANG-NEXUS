import { useI18n, type Locale } from "../lib/i18n";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
      {t("language.label")}
      <select
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium normal-case tracking-normal text-slate-700"
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        <option value="en">{t("language.en")}</option>
        <option value="zh-CN">{t("language.zh-CN")}</option>
        <option value="zh-TW">{t("language.zh-TW")}</option>
      </select>
    </label>
  );
}
