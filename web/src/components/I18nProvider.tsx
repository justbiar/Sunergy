"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { I18N } from "@/lib/i18n";

type I18nContextType = {
  t: typeof I18N.en;
  lang: string;
  setLang: (lang: string) => void;
};

const I18nContext = createContext<I18nContextType>({
  t: I18N.en,
  lang: "en",
  setLang: () => {},
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState("en");

  const i18n = useMemo(() => ({
    t: I18N[lang] || I18N.en,
    lang,
    setLang,
  }), [lang]);

  return (
    <I18nContext.Provider value={i18n}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
