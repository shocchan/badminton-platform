// 次の道カード（2026-08-19 CEO要望「N5全クリしたらN4,N3と道が増えていく」）。
//
// 出す条件は advNextRoad.nextRoadOf の実データ判定のみ（現目標の試験系stage全攻略）。
// 「合格」とは書かない: 言えるのはstage攻略の実測だけで、試験の結果は約束できない（原則13）。
// redoは lastQuest/todaySteps しか消さず mastery台帳は保持され（AdvShellのprofileFromOutcome）、
// currentStageOf が攻略済みstageを飛ばすので「引き継がれる」は実装の実挙動（advRoute.currentStageOf）。
import { pressFx } from './advUi';
import type { JlptLevel } from '../../../lib/aiLesson/course/adventure/advTypes';
import { destinationOf } from '../../../lib/aiLesson/course/adventure/advRoute';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

interface Props {
  lang: L;
  /** 制覇した（試験系stageを全攻略した）現在の目標レベル */
  clearedLevel: JlptLevel;
  /** 次の目標。null＝ソラノ塔（N2）まで到達済みで次の道は無い（N1未対応を正直に） */
  nextLevel: JlptLevel | null;
  /** CTA押下＝冒険の準備やり直し（次レベルが事前選択された状態）へ */
  onAdvance: (next: JlptLevel) => void;
}

export function AdvNextRoadCard({ lang, clearedLevel, nextLevel, onAdvance }: Props) {
  if (nextLevel === null) {
    // ソラノ塔＝世界の頂。この先（N1）は未対応なので、無い道を約束しない
    return (
      <div className="adv-celebrate-pop mb-4 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4" role="status">
        <p className="text-sm font-bold text-amber-900">
          <span aria-hidden>🎉</span>{' '}
          {tx(lang, 'ソラノ塔まで、すべての道を制覇しました！', '已经走完直到天空塔的所有道路！')}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-amber-800">
          {tx(lang, 'N1は今後追加予定です。ときどき解き直しで維持しましょう。',
            'N1将于今后追加。请偶尔重做错题来保持水平。')}
        </p>
      </div>
    );
  }
  const dest = destinationOf(nextLevel);
  return (
    <div className="adv-celebrate-pop mb-4 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4" role="status">
      <p className="text-sm font-bold text-amber-900">
        <span aria-hidden>🎉</span>{' '}
        {tx(lang, `${clearedLevel}の道を制覇しました！`, `已经走完${clearedLevel}之路！`)}
      </p>
      <p className="mt-1 text-sm font-semibold text-gray-900">
        {tx(lang, `次の目的地：${dest.labelJa}`, `下一个目的地：${dest.labelZh}`)}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-800">
        {tx(lang,
          `冒険の準備をやり直して目標を${nextLevel}に上げると、道がこの先へ伸びます。攻略済みの地域はそのまま引き継がれ、最初からやり直しにはなりません（かんたんな診断つき・5〜8分）。`,
          `重新进行冒险的准备、把目标提高到${nextLevel}后，道路会继续延伸。已攻略的地区会原样保留，不会从头再来（含简单诊断・约5〜8分钟）。`)}
      </p>
      <button type="button"
        className={`${pressFx} action-primary-blue mt-3 w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white`}
        onClick={() => onAdvance(nextLevel)}>
        {tx(lang, `${nextLevel}への道をひらく（冒険の準備へ）`, `开启通往${nextLevel}的道路（去冒险的准备）`)}
      </button>
      <p className="mt-2 text-center text-xs text-gray-500">
        {tx(lang, 'いまの目標のまま、解き直しで維持することもできます',
          '也可以保持当前目标，用重做错题来巩固')}
      </p>
    </div>
  );
}
