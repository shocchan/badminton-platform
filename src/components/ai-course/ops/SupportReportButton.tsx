// 各画面から出せる不具合報告（§17）。learnerが行き止まりにならないための最後の導線。
//
// 自動で添付するのは route/feature/locale/version/deviceClass/errorCode/教材ID だけ。
// 自由入力・会話・メールアドレスは送信payloadに含めない（送信先はCEO判断待ち）。
import { useState } from 'react';
import {
  SUPPORT_CATEGORY_LABEL, buildSupportPayload, validateSupportPayload,
  type SupportAdapter, type SupportCategory, type SupportContext,
} from '../../../lib/aiLesson/course/ops/supportReport';

interface Props {
  context: SupportContext;
  adapter: SupportAdapter;
  /** 表示言語。困っている学習者に日本語だけを見せないための必須情報 */
  lang: 'ja' | 'zh';
  /** 送信先が確定するまで表示する案内（CEO判断待ち） */
  contactFallback?: { ja: string; zh: string };
  nowMs?: number;
}

// この画面だけで使う文言。困っている学習者が最後に頼る導線なので、
// 中国語表示のときに日本語が残らないよう ja/zh を必ず対で持つ（Phase B-5で追加）。
const UI = {
  ja: {
    open: 'うまくいかないことを知らせる',
    groupLabel: '不具合の報告',
    which: 'どれが近いですか？',
    detail: 'くわしく（任意・この内容は送信されません）',
    privacy: '送るのは「どの画面か・どの教材か・アプリの版」だけです。会話の内容・入力した文・連絡先は送りません。',
    submit: '知らせる',
    cancel: 'やめる',
    sentTitle: '知らせを受け取りました',
    sentBody: '確認して直します。ありがとうございます。',
    queuedTitle: 'この端末に控えました',
    queuedBody: '送信先が未設定のため、いまは端末内に残しています。',
    close: '閉じる',
  },
  zh: {
    open: '告诉我们哪里不顺利',
    groupLabel: '问题反馈',
    which: '哪一项最接近？',
    detail: '详细说明（选填・这部分不会被发送）',
    privacy: '只会发送「哪个页面・哪个学习内容・应用版本」。不会发送对话内容、你输入的文字和联系方式。',
    submit: '告诉我们',
    cancel: '取消',
    sentTitle: '我们收到了你的反馈',
    sentBody: '我们会确认并修正。谢谢你。',
    queuedTitle: '已保存在这台设备上',
    queuedBody: '由于发送地址尚未设置，目前先保存在设备内。',
    close: '关闭',
  },
} as const;

const CATEGORIES: SupportCategory[] = ['content_wrong', 'answer_wrong', 'not_saved', 'audio_unavailable', 'layout_broken', 'other'];

export const SupportReportButton = ({ context, adapter, lang, contactFallback, nowMs }: Props) => {
  const u = UI[lang];
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [freeText, setFreeText] = useState('');
  const [result, setResult] = useState<'idle' | 'queued' | 'sent'>('idle');

  const submit = async () => {
    if (!category) return;
    const payload = buildSupportPayload({
      category, freeTextJa: freeText, context, createdAtMs: nowMs ?? Date.now(),
    });
    // 送信前に必ず検査する（禁止情報が混ざったら送らない）
    if (!validateSupportPayload(payload).ok) { setResult('queued'); return; }
    const r = await adapter.send(payload);
    setResult(r.ok ? 'sent' : 'queued');
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="min-h-11 px-3 text-xs text-gray-500 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg transition-colors active:bg-gray-100">
        {u.open}
      </button>
    );
  }

  return (
    <div className="mt-3 p-3 bg-white border border-gray-200 rounded-2xl" role="group" aria-label={u.groupLabel}>
      {result === 'idle' && (
        <>
          <p className="text-sm font-bold text-gray-900 mb-2">{u.which}</p>
          <div className="grid grid-cols-1 gap-1.5 mb-2">
            {CATEGORIES.map(c => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`min-h-11 px-3 py-2 text-left text-sm rounded-xl border action-raised action-choice touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${category === c ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
                {/* 学習者の言語を主、もう一方を従にする。zh表示で日本語が主のままだと読めない */}
                {SUPPORT_CATEGORY_LABEL[c][lang]}
                <span className="block text-[10px] text-gray-400">
                  {SUPPORT_CATEGORY_LABEL[c][lang === 'ja' ? 'zh' : 'ja']}
                </span>
              </button>
            ))}
          </div>
          <label className="block text-xs text-gray-600 mb-1" htmlFor="support-free-text">
            {u.detail}
          </label>
          <textarea id="support-free-text" value={freeText} onChange={e => setFreeText(e.target.value)}
            rows={2} className="w-full text-sm border border-gray-200 rounded-xl p-2 mb-2" />
          <p className="text-[10px] text-gray-400 mb-2">
            {u.privacy}
          </p>
          <button type="button" disabled={!category} onClick={() => void submit()}
            className={`w-full min-h-12 rounded-2xl font-bold text-sm touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${category ? 'action-raised action-primary bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
            {u.submit}
          </button>
          <button type="button" onClick={() => setOpen(false)}
            className="w-full min-h-11 mt-1 text-xs text-gray-400 underline transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{u.cancel}</button>
        </>
      )}
      {result === 'sent' && (
        <div role="status">
          <p className="text-sm font-bold text-emerald-700 mb-1">{u.sentTitle}</p>
          <p className="text-xs text-gray-600 mb-2">{u.sentBody}</p>
          <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-xs text-gray-500 underline transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{u.close}</button>
        </div>
      )}
      {result === 'queued' && (
        <div role="status">
          {/* 送信先未確定・検査で止めた場合は「受け付けた」と偽らない */}
          <p className="text-sm font-bold text-amber-700 mb-1">{u.queuedTitle}</p>
          <p className="text-xs text-gray-600 mb-2">
            {u.queuedBody}
            {contactFallback?.[lang] ?? ''}
          </p>
          <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-xs text-gray-500 underline transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{u.close}</button>
        </div>
      )}
    </div>
  );
};

export default SupportReportButton;
