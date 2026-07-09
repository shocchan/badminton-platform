import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../locales/translations';

export const PasswordResetSuccessPage = () => {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const t = translations[lang].passwordResetSuccess;

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.title}</h1>
          <p className="text-gray-600 text-sm">
            {t.subtitle}
          </p>
        </div>

        <button
          onClick={() => navigate(`/${lang}/login`)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
        >
          {t.button}
        </button>
      </div>
    </main>
  );
};
