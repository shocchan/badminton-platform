import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

type Lang = 'ja' | 'zh';
const LanguageContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'ja', setLang: () => {} });

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [lang, setLangState] = useState<Lang>(() => {
    const urlLang = searchParams.get('lang');
    if (urlLang === 'zh' || urlLang === 'ja') return urlLang;
    return (localStorage.getItem('lang') as Lang) || 'ja';
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem('lang', l);
    const params = new URLSearchParams(searchParams);
    if (l === 'zh') params.set('lang', 'zh');
    else params.delete('lang');
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    const urlLang = searchParams.get('lang');
    if (urlLang === 'zh' || urlLang === 'ja') {
      setLangState(urlLang);
      localStorage.setItem('lang', urlLang);
    }
  }, [searchParams]);

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => useContext(LanguageContext);
