import { useTheme } from "../lib/theme";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      className="inline-flex items-center rounded-[15px] border border-app px-3 py-2 text-xs font-semibold text-app-muted transition hover:border-app-strong hover:text-app"
      onClick={toggleTheme}
      type="button"
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
