# p3-n3-conv:P3-05 (P1)

## Evidence
確認済み。/Users/shocchan/badminton-aicourse/src/components/ai-course/adventure/AdvShell.tsx:564（restate画面）と:869（complete画面）の両方で pickRestateMaterial に conversationCorrection: null をハードコード。一方 AdvShell は props.sessions: CourseSessionRecord[]（AdvShell.tsx:59、AiCoursePage.tsx:1063 で渡済み）を持ち、session.report.corrections: {original, improved, noteZh}[]（src/lib/aiLesson/course/types.ts:203、LessonReport 経由）が実在＝データはあるのに未配線。さらにバトル誤答素材は AdvShell.tsx:559-562 / 870-874 で .map(([id]) => ({ expression: id })) と生の mastery ID（n3g-bakaridenaku 等）を expression に入れており、advRestate.ts:60-61 がそれを『「${expression}」（…）を使って、自分のことを一文で言ってみましょう。』とそのまま学習者に表示する。pattern（〜ばかりでなく）は N3_GRAMMAR_DRAFTS（各draftに pattern フィールドあり）から同期で引ける。

## FixSpec
■修正1: src/lib/aiLesson/course/adventure/advContent.ts — 同期pattern lookup を追加。
アンカー（現コード、29行目）:
export const N2_ALIAS_IDS = new Set(Object.keys(N2_GRAMMAR_ALIASES));
この直後に追加:
/** 内部IDを学習者に見せないためのpattern同期lookup（原則13）。
 *  n3は常時参照可・n2は loadAllN2Drafts 済みキャッシュのみ。見つからなければ null */
export const grammarPatternById = (id: string): string | null =>
  N3_GRAMMAR_DRAFTS.find((d) => d.grammarId === id)?.pattern
    ?? n2DraftsCache?.find((d) => d.grammarId === id)?.pattern
    ?? null;
（n2DraftsCache は同ファイル21行目の module 変数。AdvShell は mount 時に loadGrammarPools→loadAllN2Drafts を通るため、restate/complete 表示時にはキャッシュ済み）

■修正2: src/components/ai-course/adventure/AdvShell.tsx — import に grammarPatternById を追加。
アンカー（現コード、20-23行目）:
import {
  loadGrammarPools, buildDiagnosisPools, stageContent, loadAllN2Drafts,
  type GrammarPools, type StageContent,
} from '../../../lib/aiLesson/course/adventure/advContent';
新コード:
import {
  loadGrammarPools, buildDiagnosisPools, stageContent, loadAllN2Drafts, grammarPatternById,
  type GrammarPools, type StageContent,
} from '../../../lib/aiLesson/course/adventure/advContent';

■修正3: AdvShell.tsx restate画面（558-568行目）。
アンカー（現コード）:
  if (view === 'restate') {
    const wrongExpressions = Object.entries(prof.mastery)
      .filter(([id, at]) => (id.startsWith('n2g-') || id.startsWith('n3g-')) && at && at[at.length - 1]?.scorePct < 80)
      .slice(0, 3)
      .map(([id]) => ({ expression: id, meaningJa: tx(lang, 'バトルで間違えた文法', '战斗中答错的语法') }));
    const material = pickRestateMaterial({
      conversationCorrection: null,
      battleMistakes: wrongExpressions,
      targetExpressions: quest?.targetExpressions ?? [],
      usedExpressions: [],
    });
新コード:
  if (view === 'restate') {
    // ① 今日のAI会話レポートの修正が最優先素材（正準Journey「AI会話→レポート→言い直し」）
    const todayCorrection = (() => {
      for (const s of [...props.sessions].reverse()) {
        if (s.startedAt.slice(0, 10) !== dateKey) continue;
        const c = s.report?.corrections?.[0];
        if (c && c.original.trim() && c.improved.trim()) return { beforeJa: c.original, afterJa: c.improved };
      }
      return null;
    })();
    // ② バトル誤答は内部IDではなくpatternで見せる（原則13）。patternを引けないIDは素材にしない
    const wrongExpressions = Object.entries(prof.mastery)
      .filter(([id, at]) => (id.startsWith('n2g-') || id.startsWith('n3g-')) && at && at[at.length - 1]?.scorePct < 80)
      .map(([id]) => grammarPatternById(id))
      .filter((p): p is string => p !== null)
      .slice(0, 3)
      .map((p) => ({ expression: p, meaningJa: tx(lang, 'バトルで間違えた文法', '战斗中答错的语法') }));
    const material = pickRestateMaterial({
      conversationCorrection: todayCorrection,
      battleMistakes: wrongExpressions,
      targetExpressions: quest?.targetExpressions ?? [],
      usedExpressions: [],
    });

■修正4: AdvShell.tsx complete画面（866-877行目）。
アンカー（現コード）:
    const daily = buildDailySummary(prof, dateKey, nowISO);
    // 今日「直した表現」。言い直しstepと同じ素材の作り方をそろえる
    const todayRestate = pickRestateMaterial({
      conversationCorrection: null,
      battleMistakes: Object.entries(prof.mastery)
        .filter(([id, at]) => (id.startsWith('n2g-') || id.startsWith('n3g-'))
          && at && at[at.length - 1]?.dateKey === dateKey && at[at.length - 1]?.scorePct < 80)
        .slice(0, 1)
        .map(([id]) => ({ expression: id, meaningJa: tx(lang, 'バトルで間違えた文法', '战斗中答错的语法') })),
      targetExpressions: quest.targetExpressions,
      usedExpressions: [],
    });
新コード:
    const daily = buildDailySummary(prof, dateKey, nowISO);
    // 今日「直した表現」。言い直しstepと同じ素材の作り方をそろえる
    const completeCorrection = (() => {
      for (const s of [...props.sessions].reverse()) {
        if (s.startedAt.slice(0, 10) !== dateKey) continue;
        const c = s.report?.corrections?.[0];
        if (c && c.original.trim() && c.improved.trim()) return { beforeJa: c.original, afterJa: c.improved };
      }
      return null;
    })();
    const todayRestate = pickRestateMaterial({
      conversationCorrection: completeCorrection,
      battleMistakes: Object.entries(prof.mastery)
        .filter(([id, at]) => (id.startsWith('n2g-') || id.startsWith('n3g-'))
          && at && at[at.length - 1]?.dateKey === dateKey && at[at.length - 1]?.scorePct < 80)
        .map(([id]) => grammarPatternById(id))
        .filter((p): p is string => p !== null)
        .slice(0, 1)
        .map((p) => ({ expression: p, meaningJa: tx(lang, 'バトルで間違えた文法', '战斗中答错的语法') })),
      targetExpressions: quest.targetExpressions,
      usedExpressions: [],
    });

注意: corrections のフィールド名は original / improved（course/types.ts:203）。advRestate 側は beforeJa/afterJa（advRestate.ts:31）なのでマッピング必須。新規の ja/zh 文言は不要（advRestate.ts の既存文言「今日の会話で直したところ／今天会话中修正的地方」等がそのまま使われる）。
