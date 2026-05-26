import { useState } from 'react';
import type { Tournament } from '../types';

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

// 現在の季節から推奨番手を返す
const getShuttleNumber = () => {
  const month = new Date().getMonth() + 1; // 1-12
  return month >= 4 && month <= 9 ? '3番' : '4番';
};

export const PreEntryModal = ({ tournament, onConfirm, onClose }: PreEntryModalProps) => {
  const [checked, setChecked] = useState(false);
  const noShuttleNeeded = isShotokuDoubles(tournament);
  const shuttleNumber = getShuttleNumber();

  const rules = [
    // シャトルルール（大会種別で出し分け）
    noShuttleNeeded
      ? {
          icon: '🏸',
          title: 'シャトル持参は不要です',
          body: 'この大会（超初級ダブルス）はシャトル持参不要です。手ぶらでお越しいただけます。',
          level: 'info',
        }
      : {
          icon: '🏸',
          title: `シャトルを持参してください（今の季節の推奨：${shuttleNumber}）`,
          body: `羽毛シャトル（ナイロン不可）を8〜12球ご持参ください。日本バドミントン協会またはBWF認定の第2種検定球以上。推奨番手：4〜9月は3番・10〜3月は4番。忘れた場合は会場で1球500円で購入できます。`,
          level: 'info',
        },
    {
      icon: '⚠️',
      title: 'キャンセル期限を守ってください',
      body: 'キャンセル期限を過ぎたキャンセルは返金できません。期限内のキャンセルはお早めにご連絡ください。',
      level: 'warning',
    },
    {
      icon: '🚨',
      title: '当日キャンセル・無断欠席は厳禁',
      body: '当日のキャンセルや無断欠席は他の参加者・運営に多大なご迷惑をおかけします。繰り返し違反された場合は今後のご参加をお断りします。',
      level: 'danger',
    },
    {
      icon: '👟',
      title: '体育館シューズをご持参ください',
      body: '会場のルールにより、体育館用の室内シューズが必要です。外履きのままのご参加はできません。',
      level: 'info',
    },
    {
      icon: '🤝',
      title: 'フェアプレーでご参加ください',
      body: 'セルフジャッジ制です。お互いを尊重し、気持ちよくプレーしましょう。',
      level: 'info',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-400 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-extrabold text-lg">📋 申し込み前に確認</div>
              <div className="text-orange-100 text-xs mt-0.5">{tournament.title}</div>
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>
        </div>

        {/* スクロール可能なコンテンツ */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <p className="text-sm text-gray-600 mb-4">
            申し込む前に以下のルールをご確認ください。
          </p>

          <div className="space-y-3">
            {rules.map((rule, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 ${levelBg(rule.level)}`}
              >
                <div className={`flex items-start gap-2 ${levelText(rule.level)}`}>
                  <span className="flex-shrink-0 text-base">{rule.icon}</span>
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
              上記のルールをすべて確認しました
            </span>
          </label>

          {/* ボタン */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-100 transition-colors text-sm"
            >
              戻る
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
              申し込みに進む →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
