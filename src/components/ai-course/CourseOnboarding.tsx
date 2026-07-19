// 利用開始案内（§17）。Andyさんへ渡すのはURLだけなので、最初にここで使い方を伝える。
// 長い説明画面にしないため、要点だけをカード1枚に収める。
// 初回のみ自動表示し、以降は設定からいつでも再確認できる。

import { Mic, Clock, Globe, Headphones, MessageCircleQuestion, FileText, AlertTriangle, Check } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';

interface Props {
  t: AiCourseDict;
  /** 設定から開いたときは「閉じる」、初回は「はじめる」 */
  mode: 'first' | 'review';
  onDone: () => void;
}

export const CourseOnboarding = ({ t, mode, onDone }: Props) => {
  const to = t.onboarding;
  const items = [
    { icon: Clock, text: to.duration },
    { icon: Mic, text: to.microphone },
    { icon: Globe, text: to.browser },
    { icon: Headphones, text: to.earphones },
    { icon: MessageCircleQuestion, text: to.interrupt },
    { icon: FileText, text: to.autoReport },
  ];

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h1 className="text-xl font-bold text-gray-900">{to.title}</h1>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">{to.purpose}</p>

        <ul className="mt-5 space-y-3">
          {items.map(({ icon: Icon, text }, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <Icon className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <span className="text-sm text-gray-700 leading-relaxed">{text}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-900 leading-relaxed">{to.scopeNote}</p>
        </div>

        <p className="text-xs text-gray-500 mt-4 leading-relaxed">{to.contact}</p>

        <button type="button" onClick={onDone}
          className="w-full min-h-11 py-3 mt-5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
          <Check className="w-4 h-4" />
          {mode === 'first' ? to.start : to.close}
        </button>
        {mode === 'first' && (
          <p className="text-[11px] text-gray-400 text-center mt-2">{to.reopenHint}</p>
        )}
      </div>
    </div>
  );
};
