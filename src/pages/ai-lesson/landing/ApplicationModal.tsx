// 申込フォーム（最小構成）。
//
// スコープ（CEO決定 2026-08-02）:
// - 決済はここで行わない。**申込を受けて、人が確認して個別に案内する**運用
// - 契約書面の生成・電子契約providerの連携はしない
//
// 守ること:
// - 記録するのは「その人が見た価格ラベル」と「プラン版」と「同意した規約の版」。
//   あとで価格や規約を変えても、申込時点を再現できる
// - **保存に失敗したら成功したふりをしない。** メールの連絡先を出して人へ繋ぐ
import { useEffect, useRef, useState } from 'react';
import { X, Check as CheckIcon } from 'lucide-react';
import type { Lang } from '../../../contexts/LanguageContext';
import { LP } from './lpContent';
import { track } from './lpHelpers';
import { planById, planView, type PlanId } from '../../../lib/aiLesson/course/plans/planCatalog';
import {
  buildApplication, validateApplication, VALIDATION_MESSAGE, type ValidationError,
} from '../../../lib/aiLesson/course/plans/planApplication';
import { submitPlanApplication } from '../../../lib/aiLesson/course/plans/planApplicationRepository';
import { legalPathFor } from '../../../lib/aiLesson/course/legal/legalContent';

const tx = (lang: Lang, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

type Phase = 'form' | 'sending' | 'done' | 'unavailable' | 'error';

export function ApplicationModal({ planId, onClose, lang }: {
  planId: PlanId | null; onClose: () => void; lang: Lang;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [phase, setPhase] = useState<Phase>('form');
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const open = planId !== null;
  const plan = planId ? planById(planId) : null;

  useEffect(() => {
    if (!open) return;
    track('begin_ai_course_application', { plan: planId ?? '' });
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])');
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prevFocus?.focus?.();
    };
  }, [open, onClose, planId]);

  // 前回の入力が残らないようにするのは、呼び出し側の `key={planId}` による作り直しで行う。
  // effectでsetStateすると一瞬だけ前の入力が見える（＆cascading render になる）。

  if (!open || !plan) return null;
  const view = planView(plan, lang);

  const submit = async () => {
    const found = validateApplication({ planId: plan.id, name, email, consentChecked: consent });
    setErrors(found);
    if (found.length > 0) return;

    setPhase('sending');
    const submission = buildApplication({
      plan, locale: lang, name, email, note, nowISO: new Date().toISOString(),
    });
    const result = await submitPlanApplication(submission);
    if (result.ok) {
      track('generate_lead', { method: 'application', plan: plan.id });
      setPhase('done');
      return;
    }
    // 成功したふりをしない
    setPhase(result.reason === 'store_unavailable' ? 'unavailable' : 'error');
  };

  const label = 'block text-[0.85rem] font-bold text-lp-ink-soft mb-1';
  const field = 'w-full min-h-11 rounded-xl border border-lp-line bg-lp-card px-3 py-2 text-[0.95rem] text-lp-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-lp-pine';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/45" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true"
        aria-label={tx(lang, `${view.name}に申し込む`, `报名${view.name}`)}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-lp-card rounded-3xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end -mt-2 -mr-2">
          <button ref={closeRef} type="button" onClick={onClose}
            aria-label={tx(lang, '閉じる', '关闭')}
            className="w-9 h-9 grid place-items-center rounded-full hover:bg-lp-ivory-2 text-lp-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-lp-pine">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        {phase === 'done' ? (
          <div className="text-center pb-2">
            <span className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-lp-pine-soft text-lp-pine mx-auto">
              <CheckIcon className="w-7 h-7" aria-hidden />
            </span>
            <h3 className="mt-3 font-extrabold text-lp-ink text-xl">
              {tx(lang, '申込を受け付けました', '已收到您的报名')}
            </h3>
            <p className="mt-2 text-[0.95rem] text-lp-ink-soft leading-relaxed">
              {tx(lang,
                '内容を確認して、こちらからご連絡します。決済はこの時点では発生していません。',
                '我们会确认内容后与您联系。此时尚未产生任何付款。')}
            </p>
            <p className="mt-3 text-[0.85rem] text-lp-ink-soft">
              {tx(lang, `お申し込み：${view.name}／${view.priceLabel}`,
                `报名方案：${view.name}／${view.priceLabel}`)}
            </p>
          </div>
        ) : phase === 'unavailable' || phase === 'error' ? (
          // 送れなかったことを隠さない。人へ繋ぐ導線を必ず出す
          <div className="pb-2">
            <h3 className="font-extrabold text-lp-ink text-lg">
              {tx(lang, 'いま申込を受け付けられませんでした', '目前无法接收报名')}
            </h3>
            <p className="mt-2 text-[0.95rem] text-lp-ink-soft leading-relaxed">
              {tx(lang,
                'お手数ですが、下のメールアドレスへご連絡ください。ご希望のプランをお伝えいただければ、こちらから折り返します。',
                '麻烦您通过下面的邮箱与我们联系。告知希望的方案后，我们会尽快回复您。')}
            </p>
            <div className="mt-4 rounded-2xl bg-lp-ivory-2 border border-lp-line px-4 py-4 text-center">
              <p className="font-extrabold text-lp-ink text-base tracking-wide select-all">{LP.consultation.email}</p>
              <a href={`mailto:${LP.consultation.email}?subject=${encodeURIComponent(view.name)}`}
                className="mt-2 inline-flex items-center gap-1 text-[0.86rem] font-bold text-lp-pine bg-lp-pine-soft rounded-full px-3 py-1.5">
                {LP.consultation.emailCta[lang]}
              </a>
            </div>
          </div>
        ) : (
          <div className="pb-1">
            <h3 className="font-extrabold text-lp-ink text-lg">{view.name}</h3>
            <p className="text-[0.95rem] text-lp-ink-soft mt-0.5">
              {view.priceLabel}・{view.durationLabel}
            </p>
            <p className="mt-3 text-[0.88rem] text-lp-ink-soft leading-relaxed">
              {tx(lang,
                'まず申込内容を確認します。この画面では決済は行いません。',
                '我们会先确认报名内容。此页面不会进行付款。')}
            </p>

            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className={label} htmlFor="ap-name">{tx(lang, 'お名前', '姓名')}</label>
                <input id="ap-name" className={field} value={name} onChange={(e) => setName(e.target.value)}
                  autoComplete="name" maxLength={100} />
              </div>
              <div>
                <label className={label} htmlFor="ap-email">{tx(lang, 'メールアドレス', '邮箱地址')}</label>
                <input id="ap-email" className={field} value={email} onChange={(e) => setEmail(e.target.value)}
                  type="email" inputMode="email" autoComplete="email" maxLength={254} />
              </div>
              <div>
                <label className={label} htmlFor="ap-note">
                  {tx(lang, 'ご質問・ご要望（任意）', '问题或需求（选填）')}
                </label>
                <textarea id="ap-note" className={`${field} min-h-24`} value={note}
                  onChange={(e) => setNote(e.target.value)} maxLength={2000} />
              </div>
            </div>

            {/* キャンセル・返金は商品ごとに違いうる。断定しない */}
            <p className="mt-4 rounded-xl bg-lp-ivory-2 border border-lp-line px-3 py-2.5 text-[0.82rem] leading-relaxed text-lp-ink-soft">
              {view.termsNotice}
            </p>

            <label className="mt-3 flex items-start gap-2.5 text-[0.88rem] text-lp-ink cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 w-5 h-5 shrink-0 accent-lp-pine" />
              <span>
                {tx(lang, '', '我已阅读并同意')}
                <a href={legalPathFor(lang, 'terms')} target="_blank" rel="noopener noreferrer"
                  className="underline underline-offset-2 font-bold">{tx(lang, '利用規約', '使用条款')}</a>
                {tx(lang, 'と', '与')}
                <a href={legalPathFor(lang, 'privacy')} target="_blank" rel="noopener noreferrer"
                  className="underline underline-offset-2 font-bold">{tx(lang, 'プライバシーポリシー', '隐私政策')}</a>
                {tx(lang, 'に同意します', '')}
              </span>
            </label>

            {errors.length > 0 && (
              <ul role="alert" className="mt-3 rounded-xl bg-lp-coral/10 border border-lp-coral px-3 py-2 text-[0.85rem] text-lp-ink">
                {errors.map((e) => <li key={e}>・{VALIDATION_MESSAGE[e][lang]}</li>)}
              </ul>
            )}

            <button type="button" onClick={submit} disabled={phase === 'sending'}
              className="mt-4 w-full min-h-12 rounded-xl bg-lp-coral px-4 py-3 font-extrabold text-white disabled:opacity-60">
              {phase === 'sending'
                ? tx(lang, '送信しています…', '正在提交…')
                : tx(lang, '申込内容を送る', '提交报名')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
