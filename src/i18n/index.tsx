import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { de } from './de';
import { en, type Translations } from './en';

export type Locale = 'de' | 'en';

const dictionaries: Record<Locale, Translations> = { de, en };

/** "auth.loginTitle"-style keys for every string in the dictionary. */
type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TKey = Paths<Translations>;
export type TParams = Record<string, string | number>;

export function translate(locale: Locale, key: TKey, params?: TParams): string {
  let node: unknown = dictionaries[locale];
  for (const part of key.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  let text = typeof node === 'string' ? node : key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export function deviceLocale(): Locale {
  try {
    const code = getLocales()[0]?.languageCode;
    return code === 'de' ? 'de' : 'en';
  } catch {
    return 'de';
  }
}

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TKey, params?: TParams) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocale] = useState<Locale>(initial ?? deviceLocale());
  const t = useCallback((key: TKey, params?: TParams) => translate(locale, key, params), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
