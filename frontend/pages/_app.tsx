import type { AppProps } from "next/app";

import { LanguageProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/theme";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <Component {...pageProps} />
      </LanguageProvider>
    </ThemeProvider>
  );
}
