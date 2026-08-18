// 攻略バッジの間（2026-08-19 CEO要望「冒険マップはもっとゲーム感だしてほしい」）。
//
// **mastery台帳実測の別ビュー**であり、新しい数字を一切作らない（原則13）:
// - done地域＝金のコインバッジ（実測でdoneになった地域だけ）
// - 未done地域＝シルエット（灰色・獲得していないことを形とaria-labelでも伝える）
// - ボス地域は大型コイン＋**導出できたときだけ**攻略日を出す（推定で埋めない）
// - conversationレイヤーは攻略計測をしていないので親がexamだけを渡す（対象外）
//
// 行き止まりにしない（原則15）: バッジをタップすると該当地域カードが開き、
// そこには既存のCTA（次にすること）が必ずある。
import { pressFx } from './advUi';
import { LandmarkIcon } from './AdvMapLandmarks';
import { masteredAtOf } from '../../../lib/aiLesson/course/adventure/advMastery';
import type { MapRegion } from '../../../lib/aiLesson/course/adventure/advMapModel';
import type { AdvMasteryLedger } from '../../../lib/aiLesson/course/adventure/advTypes';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

interface Props {
  lang: L;
  /** 親が layer==='exam' だけを渡す（会話レイヤーは攻略計測なしのため対象外） */
  regions: MapRegion[];
  /** 獲得日導出用（profile.mastery） */
  ledger: AdvMasteryLedger;
  nowISO: string;
  /** このidのバッジに adv-badge-shine を1回（攻略直後の刻印演出） */
  revealRegionId?: string | null;
  /** タップで該当地域カードを開く */
  onSelect: (regionId: string) => void;
}

/** ボス地域（門・城）はバッジも大きい */
const isBoss = (r: MapRegion) => r.landmark === 'gate' || r.landmark === 'castle';

/** 獲得日 ISO → 「{M}/{D} 攻略」。導出できなければ日付行を出さない（原則13） */
const masteredDateLabel = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export const AdvMapBadges = ({
  lang, regions, ledger, nowISO, revealRegionId = null, onSelect,
}: Props) => {
  if (regions.length === 0) return null;
  const doneCount = regions.filter((r) => r.state === 'done').length;

  return (
    <section className="mt-4" aria-label={tx(lang, '攻略バッジ', '攻略徽章')}>
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <p className="text-xs font-bold text-gray-700">
          {tx(lang, '攻略バッジ', '攻略徽章')}
        </p>
        <p className="shrink-0 text-xs font-semibold text-gray-500">
          {doneCount}/{regions.length}
        </p>
      </div>
      <ul className="mt-1.5 flex gap-2 overflow-x-auto pb-1.5 pt-1">
        {regions.map((r) => {
          const done = r.state === 'done';
          const boss = isBoss(r);
          const coin = boss ? 'h-14 w-14' : 'h-11 w-11';
          // 攻略日: mastered が確定した瞬間の実測。導出できないときは出さない
          const at = done && boss ? masteredAtOf(ledger[r.id], nowISO) : null;
          const name = tx(lang, r.nameJa, r.nameZh);
          return (
            <li key={r.id} className="shrink-0">
              <button type="button" onClick={() => onSelect(r.id)}
                aria-label={done
                  ? tx(lang, `${name}・攻略済み`, `${name}・已攻略`)
                  : tx(lang, `${name}・まだ獲得していません`, `${name}・尚未获得`)}
                className={`${pressFx} action-secondary flex min-h-[44px] flex-col items-center gap-1 rounded-xl px-1 py-1`}>
                <span className={`flex items-center justify-center rounded-full ${coin} ${
                  done
                    ? 'ring-2 ring-amber-300 bg-gradient-to-b from-amber-50 to-amber-100'
                    : 'ring-1 ring-gray-300 bg-gray-100 opacity-40 grayscale'} ${
                  done && revealRegionId === r.id ? 'adv-badge-shine' : ''}`}>
                  <LandmarkIcon kind={r.landmark} size={boss ? 34 : 26} muted={!done} />
                </span>
                <span className={`max-w-[64px] truncate text-[10px] leading-tight ${
                  done ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>
                  {name}
                </span>
                {at && (
                  <span className="text-[10px] font-bold leading-none text-amber-700">
                    {tx(lang, `${masteredDateLabel(at)} 攻略`, `${masteredDateLabel(at)} 攻略`)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
