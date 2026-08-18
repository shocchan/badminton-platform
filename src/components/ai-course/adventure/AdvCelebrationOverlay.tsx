// 祝いオーバーレイ（2026-08-19 CEO「もっとゲーム感」）。
//
// 地域攻略・章クリア・レベルアップ・連続日数の節目を**1つの祝いキューで統一**して出す。
// 守っていること:
// - **実在の値だけを表示**する（原則13）。地域名・章名・Lv・日数はすべて実測から渡ってくる
// - 称号のそばには必ず TITLE_DISCLAIMER（XPの別名であり学力判定ではない）を常設する
// - 連続日数は祝いのみ。「切れた」「失った」等の喪失文言はどこにも書かない
// - アニメはすべて index.css の motion-safe ブロック内クラス → reduced-motion では静止表示
// - 行き止まりにしない（原則15）: 必ず「つづける」があり、攻略系は「冒険マップで見る」も出す
// - streak の相棒セリフは付けない（COMPANIONS.streakJa は「連続正解」用で日数文脈に合わない）
import { CompanionAvatar } from './CompanionAvatar';
import { companionById } from '../../../lib/aiLesson/course/adventure/advCompanion';
import { PASS_LABEL } from '../../../lib/aiLesson/course/adventure/advMastery';
import { TITLE_DISCLAIMER } from '../../../lib/aiLesson/course/adventure/advLevelTitles';
import type { AdvCelebration } from '../../../lib/aiLesson/course/adventure/advCelebration';
import type { AdvCompanionId } from '../../../lib/aiLesson/course/adventure/advTypes';
import { LandmarkIcon } from './AdvMapLandmarks';
import { primaryBtn, secondaryBtn } from './advUi';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

interface Props {
  lang: L;
  /** キュー先頭の1件だけ受ける（複数同時に重ねない） */
  item: AdvCelebration;
  companionId: AdvCompanionId | null;
  /** 「つづける」 */
  onClose: () => void;
  /** conquest/chapterのときだけ出す「冒険マップで見る」 */
  onGoMap?: () => void;
}

/** 見出し（dialogのaria-labelにも使う） */
const headlineOf = (lang: L, item: AdvCelebration): string => {
  switch (item.kind) {
    case 'conquest': return tx(lang, `${item.nameJa} 攻略！`, `${item.nameZh} 攻略成功！`);
    case 'chapter': return tx(lang, '章クリア！', '本章通关！');
    case 'levelup': return tx(lang, 'レベルアップ！', '升级啦！');
    case 'streak': return tx(lang, `${item.days}日つづけて冒険中！`, `已连续冒险${item.days}天！`);
  }
};

export function AdvCelebrationOverlay({ lang, item, companionId, onClose, onGoMap }: Props) {
  const comp = companionId ? companionById(companionId) : null;
  // 相棒セリフ: 攻略・レベルアップは勝利の喜び、章クリアは労い。streakには付けない（冒頭コメント）
  const compLine = comp === null ? null
    : item.kind === 'conquest' || item.kind === 'levelup'
      ? { ja: comp.cheerWinJa, zh: comp.cheerWinZh }
      : item.kind === 'chapter'
        ? { ja: comp.doneJa, zh: comp.doneZh }
        : null;
  const showGoMap = onGoMap && (item.kind === 'conquest' || item.kind === 'chapter');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-4"
      role="dialog" aria-modal="true" aria-label={headlineOf(lang, item)}
    >
      <div className="relative w-full max-w-sm">
        {/* 祝いの放射（飾り。reduced-motionでは静止） */}
        <div aria-hidden className="pointer-events-none absolute inset-0 m-auto h-[26rem] w-[26rem] max-w-none overflow-hidden">
          <div
            className="adv-ray-spin h-full w-full rounded-full opacity-40"
            style={{ background: 'repeating-conic-gradient(rgb(251 191 36 / 0.35) 0deg 12deg, transparent 12deg 24deg)' }}
          />
        </div>

        <div className="adv-celebrate-pop relative rounded-3xl bg-white p-6 text-center shadow-xl">
          {item.kind === 'conquest' && (
            <>
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-b from-amber-50 to-amber-100 ring-4 ring-amber-300">
                <LandmarkIcon kind={item.landmark} size={72} />
              </div>
              <p className="mt-3 text-xl font-bold text-gray-900">{headlineOf(lang, item)}</p>
              <p className="mt-1 text-sm font-semibold text-emerald-700">{tx(lang, item.abilityJa, item.abilityZh)}</p>
              <p className="mt-2 text-xs text-gray-600">
                {tx(lang,
                  `別の日に3回、${PASS_LABEL.ja}。7日後の確認も通りました`,
                  `在不同的3天拿到${PASS_LABEL.zh}，7天后的复查也通过了`)}
              </p>
            </>
          )}

          {item.kind === 'chapter' && (
            <>
              <p className="text-xl font-bold text-gray-900">{headlineOf(lang, item)}</p>
              <p className="mt-1 text-base font-semibold text-indigo-700">{tx(lang, item.chapterJa, item.chapterZh)}</p>
              <p className="mt-2 text-sm text-gray-600">
                {tx(lang, 'この章の地域をすべて攻略しました', '本章的所有地区都攻略完成了')}
              </p>
              <ul className="mt-3 space-y-1.5">
                {item.regions.map((r) => (
                  <li key={r.nameJa} className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-1.5 text-left">
                    <LandmarkIcon kind={r.landmark} size={22} />
                    <span className="text-sm text-gray-800">{tx(lang, r.nameJa, r.nameZh)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {item.kind === 'levelup' && (
            <>
              <p className="text-xl font-bold text-gray-900">{headlineOf(lang, item)}</p>
              <p className="check-pop mt-2 text-5xl font-extrabold tracking-tight text-blue-600">Lv.{item.level}</p>
              <p className="mt-3 text-sm font-semibold text-gray-800">
                {tx(lang, `称号：${item.titleJa}`, `称号：${item.titleZh}`)}
              </p>
              {/* 称号の注記は省略しない（XPの鉄則）。称号を出す場所には必ず添える */}
              <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{tx(lang, TITLE_DISCLAIMER.ja, TITLE_DISCLAIMER.zh)}</p>
            </>
          )}

          {item.kind === 'streak' && (
            <>
              <p className="text-5xl"><span className="adv-flame inline-block" aria-hidden>🔥</span></p>
              <p className="mt-2 text-xl font-bold text-gray-900">{headlineOf(lang, item)}</p>
              <p className="mt-2 text-sm text-gray-600">
                {tx(lang, '休んだ日があっても、積み上げは消えません', '即使有休息的日子，积累也不会消失')}
              </p>
            </>
          )}

          {compLine && comp && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-gray-50 p-3 text-left">
              <CompanionAvatar id={comp.id} size={36} />
              <p className="text-sm text-gray-700">{tx(lang, compLine.ja, compLine.zh)}</p>
            </div>
          )}

          <div className="mt-5 space-y-2">
            <button type="button" className={primaryBtn} onClick={onClose} autoFocus>
              {tx(lang, 'つづける', '继续')}
            </button>
            {showGoMap && (
              <button type="button" className={secondaryBtn} onClick={onGoMap}>
                {tx(lang, '冒険マップで見る', '去冒险地图看看')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
