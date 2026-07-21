import { useState } from 'react';
import { Feather, CalendarX, ShieldAlert, Footprints, Handshake, ClipboardCheck } from 'lucide-react';
import type { Tournament } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { getEntryTexts } from '../locales/entry';

interface PreEntryModalProps {
  tournament: Tournament;
  onConfirm: () => void;
  onClose: () => void;
}

const levelBg = (level: string) => {
  switch (level) {
    case 'danger': return 'bg-red-50 border-red-300';
    case 'warning': return 'bg-yellow-50 border-yellow-300';
    default: return 'bg-blue-50 border-blue-200';
  }
};

const levelText = (level: string) => {
  switch (level) {
    case 'danger': return 'text-red-800';
    case 'warning': return 'text-yellow-900';
    default: return 'text-blue-900';
  }
};

// 超初級ダブルスかどうか判定
const isShotokuDoubles = (tournament: Tournament) =>
  tournament.level === '超初級' && tournament.event_type?.includes('ダブルス');

export const PreEntryModal = ({ tournament, onConfirm, onClose }: PreEntryModalProps) => {
  const [checked, setChecked] = useState(false);
  const { lang } = useLanguage();
  const t = getEntryTexts(lang);
  const noShuttleNeeded = isShotokuDoubles(tournament);
  // 現在の季節から推奨番手（4〜9月:3番 / 10〜3月:4番）
  const month = new Date().getMonth() + 1;
  const shuttleNumber = month >= 4 && month <= 9 ? t.shuttleNum3 : t.shuttleNum4;

  const rules = [
    // シャトルルール（大会種別で出し分け）
    noShuttleNeeded
      ? { Icon: Feather, title: t.ruleShuttleFreeTitle, body: t.ruleShuttleFreeBody, level: 'info' }
      : { Icon: Feather, title: t.ruleShuttleTitle(shuttleNumber), body: t.ruleShuttleBody, level: 'info' },
    { Icon: CalendarX, title: t.ruleCancelTitle, body: t.ruleCancelBody, level: 'warning' },
    { Icon: ShieldAlert, title: t.ruleNoshowTitle, body: t.ruleNoshowBody, level: 'danger' },
    { Icon: Footprints, title: t.ruleShoesTitle, body: t.ruleShoesBody, level: 'info' },
    { Icon: Handshake, title: t.ruleFairTitle, body: t.ruleFairBody, level: 'info' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* ヘッダー */}
        <div className="px-6 py-4 flex-shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <ClipboardCheck className="w-5 h-5 text-blue-600" />
              </span>
              <div className="min-w-0">
                <div className="text-gray-900 font-extrabold text-lg leading-tight">{t.preTitle}</div>
                <div className="text-gray-400 text-xs mt-0.5 truncate">{tournament.title}</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
              aria-label={t.close}
            >
              ✕
            </button>
          </div>
        </div>

        {/* スクロール可能なコンテンツ */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <p className="text-sm text-gray-600 mb-4">
            {t.preIntro}
          </p>

          <div className="space-y-3">
            {rules.map((rule, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 ${levelBg(rule.level)}`}
              >
                <div className={`flex items-start gap-2.5 ${levelText(rule.level)}`}>
                  <rule.Icon className="flex-shrink-0 w-4 h-4 mt-0.5" />
                  <div>
                    <div className="font-bold text-sm">{rule.title}</div>
                    <p className="text-xs mt-1 leading-relaxed opacity-90">{rule.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* フッター */}
        <div className="border-t border-gray-100 px-6 py-4 flex-shrink-0 bg-gray-50">
          {/* チェックボックス */}
          <label className="flex items-start gap-3 cursor-pointer mb-4 select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-gray-300 accent-blue-600 flex-shrink-0 cursor-pointer"
            />
            <span className="text-sm text-gray-700 font-medium">
              {t.preCheck}
            </span>
          </label>

          {/* ボタン */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-100 transition-colors text-sm"
            >
              {t.preBack}
            </button>
            <button
              onClick={onConfirm}
              disabled={!checked}
              className={`flex-1 font-bold py-3 rounded-xl text-sm transition-colors ${
                checked
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {t.preProceed}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
