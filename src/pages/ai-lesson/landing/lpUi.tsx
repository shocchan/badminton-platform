// 販売LP 共有プリミティブ（Tailwind + 暖色テーマ lp-*）
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { track } from './lpHelpers';

/** スクロールで一度だけフェードイン。IO非対応/reduced-motion/保険タイマーで必ず表示される */
export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // reduced-motion / IO非対応 / SSR は初期から表示（effect内の同期setStateを避ける）
  const [shown, setShown] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return !!reduce || !('IntersectionObserver' in window);
  });
  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting) { setShown(true); io.disconnect(); }
    }, { threshold: 0.12 });
    io.observe(el);
    const safety = window.setTimeout(() => setShown(true), 700); // 保険：必ず出す
    return () => { io.disconnect(); window.clearTimeout(safety); };
  }, [shown]);
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'} ${className}`}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

/** セクション見出し（eyebrow + h2 + lead） */
export function SectionHeading({ eyebrow, title, lead, center = true }: { eyebrow?: string; title: string; lead?: string; center?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 ${center ? 'items-center text-center mx-auto' : ''} max-w-2xl mb-10`}>
      {eyebrow && (
        <span className="inline-flex items-center gap-2 text-[0.8rem] font-extrabold tracking-[0.14em] text-lp-coral-deep">
          <span className="inline-block w-5 h-[3px] rounded bg-lp-coral" aria-hidden="true" />
          {eyebrow}
        </span>
      )}
      <h2 className="text-[clamp(1.6rem,4.2vw,2.4rem)] font-extrabold leading-tight text-balance text-lp-ink whitespace-pre-line">{title}</h2>
      {lead && <p className="text-[1.05rem] text-lp-ink-soft leading-relaxed">{lead}</p>}
    </div>
  );
}

type CtaVariant = 'primary' | 'ghost' | 'white';
export function CtaButton({
  children, onClick, href, variant = 'primary', className = '', event, eventParams, fullWidth = false, disabled = false,
}: {
  children: ReactNode; onClick?: () => void; href?: string; variant?: CtaVariant;
  className?: string; event?: string; eventParams?: Record<string, unknown>; fullWidth?: boolean;
  /** 決済ページへの移動中など。二度押しを防ぐ */
  disabled?: boolean;
}) {
  const base = 'inline-flex items-center justify-center gap-2 font-extrabold rounded-full px-6 py-3.5 text-[1.02rem] transition-transform duration-150 active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-pine disabled:opacity-60 disabled:pointer-events-none';
  const styles: Record<CtaVariant, string> = {
    primary: 'bg-lp-coral text-white shadow-[0_8px_0_var(--color-lp-coral-deep)] hover:-translate-y-0.5',
    ghost: 'border-2 border-lp-pine text-lp-pine hover:bg-lp-pine-soft',
    white: 'bg-white text-lp-coral-deep shadow-[0_8px_0_rgba(0,0,0,0.18)] hover:-translate-y-0.5',
  };
  const cls = `${base} ${styles[variant]} ${fullWidth ? 'w-full' : ''} ${className}`;
  const handle = () => { if (event) track(event, eventParams); onClick?.(); };
  if (href) {
    return <a href={href} className={cls} onClick={handle}>{children}</a>;
  }
  return <button type="button" className={cls} onClick={handle} disabled={disabled}>{children}</button>;
}

/** チェックマーク */
export const Check = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ArrowRight = ({ className = 'w-[18px] h-[18px]' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
