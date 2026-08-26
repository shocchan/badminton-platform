// 学習の直後に、感想を任意で聞く（2026-08-26 CEO指示 Phase S7）。
//
// 【なぜ要るか】
// LPに載っている「声」は1件だけで、内容は告知文。実際の感想はゼロ。
// アカウントは12件発行済みなのに**集める仕組みが無い**ので、
// 「架空の口コミを作らない」という正しい方針が、そのまま空欄として現れている。
//
// 【この画面の約束】
//   - 任意。閉じられる。閉じたら同じセッションでは二度と出さない
//   - 掲載の許諾は**感想とは別のチェック**で、既定はOFF
//   - 許諾しても自動公開しない（管理画面で人が見てから）ことを、その場に書く
//   - 名前は求めない。呼び名を入れたい人だけ入れる
//
// 送信は ai_submit_testimonial（本人のみ・1日1件）。
import { useState } from 'react';
import { MessageSquare, X, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

type Phase = 'ask' | 'sending' | 'done' | 'error';

export function TestimonialPrompt({ lang, context, onClose }: {
  lang: 'ja' | 'zh';
  /** 何の直後か（report / trial_end）。読むときの文脈になる */
  context: string;
  onClose: () => void;
}) {
  const zh = lang === 'zh';
  const [phase, setPhase] = useState<Phase>('ask');
  const [body, setBody] = useState('');
  const [consent, setConsent] = useState(false);      // 既定OFF（CEO方針）
  const [displayName, setDisplayName] = useState('');

  const send = async () => {
    if (!body.trim() || phase === 'sending') return;
    setPhase('sending');
    const { data, error } = await supabase.rpc('ai_submit_testimonial', {
      p_body: body,
      p_consent_publish: consent,
      p_display_name: displayName || null,
      p_locale: lang,
      p_context: context,
    });
    const ok = !error && (data as { ok?: boolean } | null)?.ok === true;
    // already_today（今日すでに送っている）も本人には成功として見せる。
    // 「送れませんでした」と言うと、二重に書かせることになる
    const code = (data as { code?: string } | null)?.code;
    setPhase(ok || code === 'already_today' ? 'done' : 'error');
  };

  if (phase === 'done') {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
        <p className="flex items-start gap-2 text-sm font-bold text-emerald-900">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {zh ? '收到了，谢谢！' : '受け取りました。ありがとうございます。'}
        </p>
        {consent && (
          <p className="mt-1 pl-6 text-[12px] leading-relaxed text-emerald-800">
            {zh
              ? '掲載前に必ず本人確認します。すぐには公開されません。'
              : '掲載する前に必ず内容を確認します。すぐに公開されることはありません。'}
          </p>
        )}
        <button type="button" onClick={onClose}
          className="mt-2 ml-6 min-h-9 text-[12px] font-bold text-emerald-800 underline underline-offset-2">
          {zh ? '关闭' : '閉じる'}
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby="testimonial-heading"
      className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <p id="testimonial-heading" className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <MessageSquare className="h-4 w-4 text-blue-600" aria-hidden="true" />
          {zh ? '这次学习，能说一句感想吗？' : '今回の学習について、一言いただけますか？'}
        </p>
        <button type="button" onClick={onClose}
          aria-label={zh ? '关闭' : '閉じる'}
          className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
        {zh
          ? '不写也完全没关系。写了的话，会用来改进这个教室。'
          : '書かなくてもまったく問題ありません。いただいた声は、この教室の改善に使います。'}
      </p>

      <label className="mt-2.5 block">
        <span className="sr-only">{zh ? '感想' : '感想'}</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder={zh ? '例：第一次开口的时候很紧张，但被纠正之后再说一遍就顺了。' : '例：はじめは緊張したけど、直してもらってもう一度言ったら通じました。'}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500"
        />
      </label>

      {/*
        掲載の許諾は**感想とは別のチェック**。既定はOFF。
        ここを既定ONにしたり、感想と一体にしたりしないこと（CEO方針）
      */}
      <label className="mt-2 flex items-start gap-2 text-[12.5px] leading-relaxed text-gray-700">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500" />
        <span>
          {zh
            ? '这段感想可以匿名用于介绍这个课程。'
            : 'この感想を、匿名でサービス紹介に掲載してもよいです。'}
          <span className="block text-[11px] text-gray-500">
            {zh
              ? '勾选后也不会自动公开。会由老师确认内容之后再决定。'
              : 'チェックしても自動では公開されません。先生が内容を確認してから決めます。'}
          </span>
        </span>
      </label>

      {consent && (
        <label className="mt-2 block">
          <span className="text-[12px] font-bold text-gray-600">
            {zh ? '想署名的话（可留空）' : '載せるときの呼び名（空でもOK）'}
          </span>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            placeholder={zh ? '例：小李（不填就用匿名）' : '例：Lさん（空なら匿名で載せます）'}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500" />
        </label>
      )}

      {phase === 'error' && (
        <p role="alert" className="mt-2 text-[12.5px] text-red-600">
          {zh ? '暂时没能送出。稍后再试也可以，不写也没关系。' : 'いま送れませんでした。あとでも、書かなくても大丈夫です。'}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={() => void send()} disabled={!body.trim() || phase === 'sending'}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
          {phase === 'sending' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {zh ? '送出' : '送る'}
        </button>
        <button type="button" onClick={onClose}
          className="min-h-11 shrink-0 px-3 text-sm text-gray-500 hover:text-gray-700">
          {zh ? '这次不写' : '今回は書かない'}
        </button>
      </div>
    </section>
  );
}

export default TestimonialPrompt;
