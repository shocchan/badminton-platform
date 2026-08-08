// V2招待（?v2=1）で来た新規学習者用の入口。**聞くのは名前だけ。**
//
// 監査P1: 旧8問ヒアリング→V2オンボーディングで目標・現レベル・週頻度を
// 二重に答えさせていた（「さっき答えたのに」という不信＋学習開始まで約30タップ）。
// V2招待者の本当の設定はV2オンボーディングで聞くので、ここでは名前だけ預かる。
// 旧コースから来た学習者（?v2なし）は従来どおり8問のCourseHearingを通る。
import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { ShokoAvatar } from './ShokoAvatar';

interface Props {
  lang: 'ja' | 'zh';
  onComplete: (displayName: string) => void;
  busy?: boolean;
}

const TXT = {
  ja: {
    title: 'はじめまして！',
    sub: 'お名前だけ教えてください。目標や学習ペースは、このあとの「冒険の準備」で一緒に決めます（約3分）。',
    name: 'お名前（ニックネーム可）',
    namePh: '例：ワン',
    start: '冒険の準備へ進む',
    busyLabel: '準備中…',
  },
  zh: {
    title: '初次见面！',
    sub: '只需要告诉我们你的名字。目标和学习节奏，会在接下来的「冒险准备」中一起决定（约3分钟）。',
    name: '姓名（可用昵称）',
    namePh: '例：小王',
    start: '进入冒险准备',
    busyLabel: '准备中…',
  },
} as const;

export const CourseNameOnlyHearing = ({ lang, onComplete, busy = false }: Props) => {
  const [name, setName] = useState('');
  const t = TXT[lang];
  const canStart = name.trim().length > 0 && !busy;
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <ShokoAvatar size={64} className="mb-3" />
      <h1 className="text-xl font-bold text-gray-900">{t.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{t.sub}</p>
      <label className="mt-6 block">
        <span className="text-xs font-bold text-gray-700">{t.name}</span>
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t.namePh} maxLength={40} autoComplete="nickname"
          className="mt-1 w-full min-h-[48px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          onKeyDown={(e) => { if (e.key === 'Enter' && canStart) onComplete(name.trim()); }}
        />
      </label>
      <button type="button" disabled={!canStart}
        onClick={() => onComplete(name.trim())}
        className={`mt-4 flex w-full min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white transition-all duration-150 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] disabled:opacity-40 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${canStart ? 'shadow-md shadow-blue-600/25' : ''}`}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {busy ? t.busyLabel : t.start}
        {!busy && <ArrowRight className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
};
