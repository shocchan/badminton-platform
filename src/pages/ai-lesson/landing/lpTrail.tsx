// LPの「今どこまで来たか」を出す道しるべ（2026-08-27）。
//
// 【なぜ足すか】
// 本番の実測で、LPはスマホ27画面ぶん（22,301px）あるのに画像は9枚しかなく、
// 14セクション中12が画像ゼロだった。文字が続くと、あとどれだけあるのか分からない。
// 分からないまま長い文章を読ませるのが、いちばん離脱する形。
//
// 【なぜ画像ではなくCSSか】
// これは全画面に出て、しかもページ先頭にあるので遅延読み込みできない。
// 画像にすると全訪問者の初回表示に乗る。破線と丸だけなので**0KB**で描く。
// 「重くしない」を、装飾を減らすのではなく作り方で満たす。
//
// 【なぜ横ではなく上か】
// 最初は左脇に縦の道を引いたが、スマホ幅では出しようがなく（幅が足りない）、
// いちばん困っている画面で効かなかった。上の細い帯なら両方で効く。
//
// 【意味づけ】
// 装飾ではなく現在地。この商品自体が「冒険マップで現在地が見える」ものなので、
// LPを読む体験と、買ったあとの体験が同じ形になる。
//
// prefers-reduced-motion では滑らかな追従をやめる（値は更新するが遷移しない）。
import { useEffect, useState } from 'react';

export function LpTrailProgress({ label }: { label: string }) {
  const [pct, setPct] = useState(0);
  const [show, setShow] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    try { setReduce(window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { /* noop */ }

    /*
     * 間引きは requestAnimationFrame ではなく「丸めた値が変わったときだけ更新」で行う。
     * rAF は**タブが裏にあると止まる**ので、裏で位置が変わったまま戻ってきたときに
     * 値が古いままになる。整数％しか使わないので、変化がなければ再描画しないだけで足りる。
     */
    let lastPct = -1;
    let lastShow: boolean | null = null;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      const next = max > 0 ? Math.min(100, Math.max(0, Math.round((y / max) * 100))) : 0;
      if (next !== lastPct) { lastPct = next; setPct(next); }
      // FVを読み終える前は出さない（最初から出ると「まだ何も読んでいない」を突きつける）
      const nextShow = y > 400;
      if (nextShow !== lastShow) { lastShow = nextShow; setShow(nextShow); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`fixed inset-x-0 top-0 z-50 h-[3px] transition-opacity duration-300 ${
        show ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* まだ歩いていない道。破線にして「地図の点線」に見せる */}
      <div className="absolute inset-0"
        style={{ backgroundImage: 'repeating-linear-gradient(to right, var(--color-lp-line) 0 5px, transparent 5px 10px)' }} />
      {/* 歩いた道 */}
      <div
        className="absolute inset-y-0 left-0 bg-lp-coral"
        style={{ width: `${pct}%`, transition: reduce ? 'none' : 'width 120ms linear' }}
      />
      {/* いまいる場所。道の先端に小さく置く */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-lp-coral-deep ring-2 ring-lp-ivory"
        style={{ left: `${pct}%`, width: 8, height: 8, transition: reduce ? 'none' : 'left 120ms linear' }}
        aria-hidden="true"
      />
    </div>
  );
}
