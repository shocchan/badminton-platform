import { useEffect } from 'react';
import { useParams, Outlet, Navigate } from 'react-router-dom';

const VALID_LANGS: Record<string, string[]> = {
  'kawaguchi-warabi': ['ja', 'zh'],
  'chaoxianzu': ['ja', 'zh', 'ko'],
  'assistant': ['ja', 'zh'],
};

interface LangWrapperProps {
  groupSlug: string;
}

const LangWrapper: React.FC<LangWrapperProps> = ({ groupSlug }) => {
  const { lang } = useParams<{ lang: string }>();
  const validLangs = VALID_LANGS[groupSlug] || ['ja'];
  const fallback = groupSlug === 'kawaguchi-warabi' ? '/ja/' : `/${groupSlug}/ja/`;

  useEffect(() => {
    if (lang && validLangs.includes(lang)) {
      // SEO: html lang は BCP47 準拠。zh は簡体字コミュニティ向けなので zh-CN を出力。
      // ja / ko はそのまま。
      const htmlLang = lang === 'zh' ? 'zh-CN' : lang;
      document.documentElement.lang = htmlLang;
    }
  }, [lang, validLangs]);

  if (!lang || !validLangs.includes(lang)) {
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
};

export default LangWrapper;
