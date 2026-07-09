import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

export type Lang = 'ja' | 'zh';

interface LanguageContextValue {
  lang: Lang;
  groupSlug: string;
}

const LanguageContext = createContext<LanguageContextValue>({ lang: 'ja', groupSlug: 'kawaguchi-warabi' });

// URLパスから lang と groupSlug を導出する
// kawaguchi-warabi: /:lang/...  それ以外のグループ: /:groupSlug/:lang/...
const KNOWN_SUBGROUPS = ['chaoxianzu', 'assistant'];

const parseLangFromPath = (pathname: string): LanguageContextValue => {
  const parts = pathname.split('/').filter(Boolean);
  if (KNOWN_SUBGROUPS.includes(parts[0])) {
    const l = parts[1];
    return {
      lang: (l === 'zh' ? 'zh' : 'ja') as Lang,
      groupSlug: parts[0],
    };
  }
  const l = parts[0];
  return {
    lang: (l === 'zh' ? 'zh' : 'ja') as Lang,
    groupSlug: 'kawaguchi-warabi',
  };
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();
  const value = useMemo(() => parseLangFromPath(pathname), [pathname]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => useContext(LanguageContext);
