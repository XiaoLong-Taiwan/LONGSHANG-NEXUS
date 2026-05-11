import type { AppProps } from "next/app";

import { LanguageProvider } from "../lib/i18n";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <LanguageProvider>
      <Component {...pageProps} />
    </LanguageProvider>
  );
}
