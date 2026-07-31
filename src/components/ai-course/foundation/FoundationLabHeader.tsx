// 日本語のしくみ トップの役割ヘッダー（2026-07-30 CEO UX指示）。
// 「ことば＝材料／しくみ＝ルール」の違いを3秒で判断できるようにする。
// - 純表示（storage非依存）。件数はfoundationRegistry（canonical）とpropsから受け取る。
// - 実装に無い内容（読解・聴解・N2/N1網羅）は書かない。ソラノ塔との関係は実装どおり
//   「順序の条件なし」を明示する。
import type { AiCourseDict } from '../../../locales/aiCourse';

export interface FoundationLabHeaderProps {
  t: AiCourseDict;
  unitsTotal: number;
  unitsDone: number;
}

export const FoundationLabHeader = ({ t, unitsTotal, unitsDone }: FoundationLabHeaderProps) => {
  const hr = t.hubRoles;
  const pct = unitsTotal ? Math.round((unitsDone / unitsTotal) * 100) : 0;
  return (
    <div className="bg-white rounded-2xl border border-indigo-100 p-4 mb-3">
      {/* ⓪ 役割（ここはルールを学ぶ場所・単語暗記の場所ではない） */}
      <p className="text-xs text-gray-700 leading-relaxed">{hr.labRole}</p>
      <p className="text-[11px] text-gray-500 mt-1">{hr.labRoleSub}</p>

      {/* ① 対象範囲と進捗（実データ: FOUNDATION_UNIT_META＋完了サマリー） */}
      <p className="text-[11px] font-bold text-gray-600 mt-3">{hr.labScope(unitsTotal)}</p>
      <div className="mt-2">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-bold text-gray-500">{hr.labProgress(unitsDone, unitsTotal)}</p>
          <p className="text-xs font-bold text-gray-900">{unitsDone}/{unitsTotal}</p>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1" role="img"
          aria-label={hr.labProgress(unitsDone, unitsTotal)}>
          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ② 例（説明専用の固定データ・問題の正解は含まない） */}
      <p className="text-[10px] text-gray-400 mt-2">{hr.exampleHeading}: {hr.labExample}</p>

      {/* ③ 完了後にできること・ことばとの違い・ソラノ塔との関係（折りたたみで密度を抑える） */}
      <details className="mt-2">
        <summary className="text-xs font-bold text-gray-700 cursor-pointer min-h-8 flex items-center">
          {hr.guideTitle}
        </summary>
        <ul className="text-[11px] text-gray-600 mt-1 space-y-1">
          <li>{hr.labDone}</li>
          <li>{hr.labVsVocab}</li>
          <li>{hr.labVsSorano}</li>
        </ul>
      </details>

      {/* ④ 上級者向け（実装済みの範囲のみ: 誤用訂正・助詞選択・語順・活用の問題は実在） */}
      <p className="text-[11px] text-slate-600 mt-2">{hr.labAdvanced}</p>

      {/* ⑤ RPG併記（文法の工房＝一般機能名を隠さない） */}
      <p className="text-[10px] text-gray-400 mt-2">{t.world.facilities.workshop.name}（{t.world.facilities.workshop.fn}）</p>
    </div>
  );
};

export default FoundationLabHeader;
