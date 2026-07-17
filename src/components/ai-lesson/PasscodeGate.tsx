// 限定公開デモのパスコードゲート
// コードは VITE_AI_LESSON_DEMO_CODE（ビルド時環境変数）と照合する。
// 注意: フロント側の照合は「URLを知っている人の中でのふるい」でしかない。
// OpenAI API 接続時は、このコードをリクエストに添えて Edge Function 側でも必ず検証すること。

import { useState } from 'react';
import { Lock, ArrowRight } from 'lucide-react';
import { markGatePassed } from '../../lib/aiLesson/repository';
import type { AiLessonDict } from '../../locales/aiLesson';

interface Props {
  t: AiLessonDict['gate'];
  onPassed: () => void;
}

export const PasscodeGate = ({ t, onPassed }: Props) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const expected = import.meta.env.VITE_AI_LESSON_DEMO_CODE as string | undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expected) return;
    if (code.trim() === expected) {
      markGatePassed();
      onPassed();
    } else {
      setError(true);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">{t.title}</h1>
        <p className="text-sm text-gray-500 mt-2 mb-6">{t.subtitle}</p>

        {!expected ? (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">{t.notConfigured}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              inputMode="text"
              autoComplete="off"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(false); }}
              placeholder={t.placeholder}
              className="w-full min-h-11 px-4 py-3 border border-gray-300 rounded-xl text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {error && <p className="text-sm text-red-600">{t.error}</p>}
            <button
              type="submit"
              disabled={!code.trim()}
              className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {t.submit}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
