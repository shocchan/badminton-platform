// アップセルの表示（§12 §13）。
//
// 出すかどうかは **このcomponentでは決めない**。`upsell.decideUpsell()` が決める。
// ここは「決まったものを、押し付けずに見せる」だけ。
//
// 押し付けない、を具体的に:
//   - 画面を覆わない（学習の手が止まらない）
//   - 「今はしない」が同じ大きさで見えている
//   - 閉じるとその場で消え、記録が残って冷却期間に入る
//   - カウントダウン・残り枠・期限のような焦らせる要素を置かない

import { upsellCopy, type UpsellDecision } from '../../../lib/aiLesson/course/sales/upsell';
import { purchasePathFor } from '../../../lib/aiLesson/course/sales/plansContent';
import { Link } from 'react-router-dom';

export interface UpsellPromptProps {
  decision: UpsellDecision;
  lang: 'ja' | 'zh';
  /** 「今はしない」を押した */
  onDismiss: () => void;
  /** 訴求先へ進んだ */
  onAccept: () => void;
}

export const UpsellPrompt = ({ decision, lang, onDismiss, onAccept }: UpsellPromptProps) => {
  if (!decision.show || !decision.targetPlanId) return null;
  const copy = upsellCopy(decision.targetPlanId, lang);

  return (
    <aside
      // モーダルにしない。学習の手を止めない位置に置く
      aria-labelledby="upsell-heading"
      data-testid="upsell-prompt"
      className="mt-6 rounded-2xl border border-lp-line bg-white p-5"
    >
      <h3 id="upsell-heading" className="text-base font-extrabold text-lp-ink">
        {copy.heading}
      </h3>

      <ul className="mt-3 space-y-1.5">
        {copy.points.map((p) => (
          <li key={p} className="text-[0.9rem] leading-relaxed text-lp-ink-soft">
            {p}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link
          to={purchasePathFor(lang, decision.targetPlanId)}
          onClick={onAccept}
          className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-lp-coral px-4 text-center font-bold text-white hover:bg-lp-coral-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-coral-deep"
        >
          {copy.acceptLabel}
        </Link>
        {/* 断る側を小さくしない。目立たせて隠す、をやらない */}
        <button
          type="button"
          onClick={onDismiss}
          data-testid="upsell-dismiss"
          className="flex min-h-12 flex-1 items-center justify-center rounded-xl border border-lp-line px-4 text-center font-bold text-lp-ink-soft hover:bg-lp-ivory focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-coral-deep"
        >
          {copy.dismissLabel}
        </button>
      </div>
    </aside>
  );
};

export default UpsellPrompt;
