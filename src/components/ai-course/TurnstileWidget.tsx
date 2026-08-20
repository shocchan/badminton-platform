// Cloudflare Turnstile（botかどうかの判定）。
//
// 方針:
// - **サイトキーが設定されているときだけ動く。** 未設定なら何も描画せず、
//   onToken(null) のまま＝フォームは従来どおり送れる（環境で壊れない）
// - 多くの利用者は何も操作せずに通過する（画像選択のようなクイズは出ない）
// - 読み込めなかったとき（中国のネットワーク等）は**送信を止めない**。
//   その場合サーバー側は token 無しを受け取るので、Turnstileを必須にしている
//   本番では弾かれる。弾かれた画面には「もう一度」とメール窓口を出す（行き止まりにしない）
import { useEffect, useRef, useState } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_ID = 'cf-turnstile-script';

/** この環境でbot対策が有効か（画面側が「送信できる条件」を判断するのに使う） */
export const turnstileEnabled = (): boolean => !!SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

export function TurnstileWidget({ lang, onToken }: {
  lang: 'ja' | 'zh';
  onToken: (token: string | null) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!SITE_KEY) return;
    let alive = true;

    const render = () => {
      if (!alive || !boxRef.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(boxRef.current, {
        sitekey: SITE_KEY,
        language: lang === 'zh' ? 'zh-cn' : 'ja',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => { setFailed(true); onToken(null); },
        theme: 'light',
      });
    };

    if (window.turnstile) { render(); return () => { alive = false; }; }

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', render);
    script.addEventListener('error', () => { if (alive) setFailed(true); });
    return () => {
      alive = false;
      script?.removeEventListener('load', render);
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch { /* noop */ }
        widgetId.current = null;
      }
    };
  }, [lang, onToken]);

  if (!SITE_KEY) return null;

  return (
    <div className="mt-3">
      <div ref={boxRef} />
      {failed && (
        <p className="mt-1 text-[0.8rem] text-lp-ink-soft">
          {lang === 'zh'
            ? '安全验证加载失败。仍可提交，如果没有成功，请直接发邮件联系我们。'
            : '確認の読み込みに失敗しました。送信はできますが、うまくいかない場合はメールでご連絡ください。'}
        </p>
      )}
    </div>
  );
}

export default TurnstileWidget;
