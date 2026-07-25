import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../../../contexts/LanguageContext';
import { LP, type VariantConfig } from './lpContent';
import { Reveal, SectionHeading, CtaButton, ArrowRight } from './lpUi';
import { track, imgUrl } from './lpHelpers';
import { Plus, X, MessageSquare, Copy, Check as CheckIcon } from 'lucide-react';

export function FaqSection({ lang }: { lang: Lang }) {
  return (
    <section id="faq" className="py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-5">
        <Reveal><SectionHeading title={LP.faq.heading[lang]} /></Reveal>
        <div className="flex flex-col gap-3">
          {LP.faq.items[lang].map((it, i) => (
            <Reveal key={i} delay={Math.min(i, 6) * 30}>
              <details
                className="group bg-lp-card border border-lp-line rounded-2xl px-5 open:border-lp-coral"
                onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) track('open_ai_course_faq', { index: i }); }}
              >
                <summary className="list-none cursor-pointer py-4 flex items-center justify-between gap-4 font-bold text-[1.02rem] text-lp-ink [&::-webkit-details-marker]:hidden">
                  {it.q}
                  <span className="shrink-0 w-6 h-6 rounded-full bg-lp-coral-soft text-lp-coral-deep grid place-items-center transition-transform group-open:rotate-45">
                    <Plus className="w-4 h-4" aria-hidden="true" />
                  </span>
                </summary>
                <div className="pb-4 text-[0.96rem] text-lp-ink-soft leading-relaxed">{it.a}</div>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCtaSection({ v, lang, onConsult }: { v: VariantConfig; lang: Lang; onConsult: () => void }) {
  const f = LP.finalCta;
  const [cw, ch] = v.imageSize.cheer;
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-5">
        <Reveal>
          <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-b from-lp-coral to-lp-coral-deep text-white text-center px-6 py-14 sm:py-20">
            <img
              src={imgUrl(v.images.cheer)} width={cw} height={ch}
              alt={lang === 'ja' ? `${v.name.ja}` : `${v.name.zh}`}
              loading="lazy" decoding="async"
              className="w-[130px] h-auto mx-auto mb-4 drop-shadow-[0_10px_16px_rgba(0,0,0,0.2)]"
            />
            <h2 className="text-[clamp(1.6rem,4.5vw,2.4rem)] font-extrabold text-balance">{f.heading[lang]}</h2>
            <p className="mt-4 mx-auto max-w-[34em] text-white/90 text-[1.05rem]">{f.body[lang]}</p>
            <div className="mt-7">
              <CtaButton variant="white" onClick={onConsult} event="click_ai_course_consultation" eventParams={{ location: 'final', variant: v.key }}>
                {LP.ctaPrimary[lang]} <ArrowRight />
              </CtaButton>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** WeChat相談モーダル（ID: Shocchance）。将来フォーム/リンクに切替可能な単一導線 */
export function ConsultationModal({ open, onClose, lang, variant }: {
  open: boolean; onClose: () => void; lang: Lang; variant: string;
}) {
  const c = LP.consultation;
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    track('begin_ai_course_consultation', { variant });
    track('generate_lead', { method: 'wechat', variant });
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      // フォーカストラップ
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])');
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prevFocus?.focus?.(); };
  }, [open, onClose, variant]);

  if (!open) return null;
  const copyId = async () => {
    try { await navigator.clipboard.writeText(c.wechatIdPlaceholder); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* noop */ }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/45" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={c.heading[lang]} className="w-full max-w-sm bg-lp-card rounded-3xl p-7 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end -mt-2 -mr-2">
          <button ref={closeRef} type="button" onClick={onClose} aria-label={lang === 'ja' ? '閉じる' : '关闭'} className="w-9 h-9 grid place-items-center rounded-full hover:bg-lp-ivory-2 text-lp-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-lp-pine">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <span className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-lp-pine-soft text-lp-pine mx-auto">
          <MessageSquare className="w-7 h-7" aria-hidden="true" />
        </span>
        <h3 className="mt-3 font-extrabold text-lp-ink text-xl">{c.heading[lang]}</h3>
        <p className="mt-2 text-[0.96rem] text-lp-ink-soft leading-relaxed">{c.body[lang]}</p>

        <div className="mt-5 rounded-2xl bg-lp-ivory-2 border border-lp-line px-4 py-4">
          <p className="text-[0.8rem] font-bold text-lp-ink-soft">{c.wechatLabel[lang]}</p>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="font-extrabold text-lp-ink text-lg tracking-wide select-all">{c.wechatIdPlaceholder}</span>
            <button type="button" onClick={copyId} className="inline-flex items-center gap-1 text-[0.82rem] font-bold text-lp-pine bg-lp-pine-soft rounded-full px-2.5 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lp-pine">
              {copied ? <><CheckIcon className="w-3.5 h-3.5" />{lang === 'ja' ? 'コピー済み' : '已复制'}</> : <><Copy className="w-3.5 h-3.5" />{lang === 'ja' ? 'コピー' : '复制'}</>}
            </button>
          </div>
        </div>
        <p aria-live="polite" className="sr-only">{copied ? (lang === 'ja' ? 'コピーしました' : '已复制') : ''}</p>
        <p className="mt-4 text-[0.9rem] text-lp-ink leading-relaxed">{c.searchHint[lang]}</p>
        <p className="mt-3 text-[0.84rem] text-lp-ink-soft">{c.fallbackNote[lang]}</p>
      </div>
    </div>
  );
}
