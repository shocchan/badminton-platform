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
  /** 送信先が確定するまで表示する案内（CEO判断待ち） */
  contactFallbackJa?: string;
  nowMs?: number;
}

const CATEGORIES: SupportCategory[] = ['content_wrong', 'answer_wrong', 'not_saved', 'audio_unavailable', 'layout_broken', 'other'];

export const SupportReportButton = ({ context, adapter, contactFallbackJa, nowMs }: Props) => {
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
        className="min-h-11 px-3 text-xs text-gray-500 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg">
        うまくいかないことを知らせる
      </button>
    );
  }

  return (
    <div className="mt-3 p-3 bg-white border border-gray-200 rounded-2xl" role="group" aria-label="不具合の報告">
      {result === 'idle' && (
        <>
          <p className="text-sm font-bold text-gray-900 mb-2">どれが近いですか？</p>
          <div className="grid grid-cols-1 gap-1.5 mb-2">
            {CATEGORIES.map(c => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`min-h-11 px-3 py-2 text-left text-sm rounded-xl border ${category === c ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
                {SUPPORT_CATEGORY_LABEL[c].ja}
                <span className="block text-[10px] text-gray-400">{SUPPORT_CATEGORY_LABEL[c].zh}</span>
              </button>
            ))}
          </div>
          <label className="block text-xs text-gray-600 mb-1" htmlFor="support-free-text">
            くわしく（任意・この内容は送信されません）
          </label>
          <textarea id="support-free-text" value={freeText} onChange={e => setFreeText(e.target.value)}
            rows={2} className="w-full text-sm border border-gray-200 rounded-xl p-2 mb-2" />
          <p className="text-[10px] text-gray-400 mb-2">
            送るのは「どの画面か・どの教材か・アプリの版」だけです。会話の内容・入力した文・連絡先は送りません。
          </p>
          <button type="button" disabled={!category} onClick={() => void submit()}
            className={`w-full min-h-12 rounded-2xl font-bold text-sm ${category ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
            知らせる
          </button>
          <button type="button" onClick={() => setOpen(false)}
            className="w-full min-h-11 mt-1 text-xs text-gray-400 underline">やめる</button>
        </>
      )}
      {result === 'sent' && (
        <div role="status">
          <p className="text-sm font-bold text-emerald-700 mb-1">知らせを受け取りました</p>
          <p className="text-xs text-gray-600 mb-2">確認して直します。ありがとうございます。</p>
          <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-xs text-gray-500 underline">閉じる</button>
        </div>
      )}
      {result === 'queued' && (
        <div role="status">
          {/* 送信先未確定・検査で止めた場合は「受け付けた」と偽らない */}
          <p className="text-sm font-bold text-amber-700 mb-1">この端末に控えました</p>
          <p className="text-xs text-gray-600 mb-2">
            送信先が未設定のため、いまは端末内に残しています。
            {contactFallbackJa ?? ''}
          </p>
          <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-xs text-gray-500 underline">閉じる</button>
        </div>
      )}
    </div>
  );
};

export default SupportReportButton;
