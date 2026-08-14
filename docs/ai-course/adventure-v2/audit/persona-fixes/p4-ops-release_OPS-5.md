# p4-ops-release:OPS-5 (P2)

## Evidence
advWeekly.ts:118 の skills は ['charactersVocabulary','grammar','reading','listening'] のJLPT4技能のみで、conversation は PRACTICAL_SKILLS 別軸（advExamSkills.ts:24-25）のため週まとめに一切出ない。buildWeeklySummary の引数は (prof, nowISO) のみで sessions を受けない。AdvShell.tsx:777-861 の weekly ビューにも会話行なし。会話中心の週は newlyMastered/improved/mock がすべて0になり headline が160行の「変化として言えるものが出るまで…」に落ち、insufficientData=true（147-148行）。props.sessions は AdvShell に既に渡っている（AdvShellProps:59）ので接続のみで足りる。

## FixSpec
対象: advWeekly.ts と AdvShell.tsx（最小接続のみ。監査案の「自力使用率の前週比」は calculateSpeakingGrowth が週区切りでなく通算比較の設計のため週まとめには流用せず、実測回数のみを出す＝原則13の範囲で正直に）。

【編集1】/Users/shocchan/badminton-aicourse/src/lib/aiLesson/course/adventure/advWeekly.ts のimport（8-12行）に追加:
import type { CourseSessionRecord } from '../types';

【編集2】WeeklySummary interface の `mockCount: number;` の直後に追加:
  /** 今週やり切ったAI会話の回数（別軸の実測。JLPT準備度には足さない） */
  conversationCount: number;

【編集3】シグネチャ変更（94-97行）、旧:
export const buildWeeklySummary = (
  prof: AdventureV2Profile,
  nowISO: string,
): WeeklySummary => {
新:
export const buildWeeklySummary = (
  prof: AdventureV2Profile,
  nowISO: string,
  sessions: CourseSessionRecord[] = [],
): WeeklySummary => {

【編集4】`const mockCount = ...`（144行）の直後に追加:
  const conversationCount = sessions.filter((s) =>
    s.completionStatus === 'completed' && inThisWeek(dayKey(new Date(s.startedAt)))).length;

【編集5】insufficientData（147-148行）、旧:
  const insufficientData = studyDays === 0
    || (newlyMastered.length === 0 && improved.length === 0 && mockCount === 0);
新:
  const insufficientData = studyDays === 0
    || (newlyMastered.length === 0 && improved.length === 0 && mockCount === 0 && conversationCount === 0);

【編集6】headlineJa の `if (mockCount > 0) return ...;` 行の直後に追加:
    if (conversationCount > 0) return `今週はAI会話を${conversationCount}回やり切りました。話した記録が積み上がっています。`;
headlineZh の `if (mockCount > 0) return ...;` 行の直後に追加:
    if (conversationCount > 0) return `本周完成了${conversationCount}次AI会话，开口说的记录在不断积累。`;

【編集7】return オブジェクトの `mockCount,` の直後に `conversationCount,` を追加。

【編集8】/Users/shocchan/badminton-aicourse/src/components/ai-course/adventure/AdvShell.tsx:778、旧:
    const wk = buildWeeklySummary(prof, nowISO);
新:
    const wk = buildWeeklySummary(prof, nowISO, props.sessions);

【編集9】AdvShell.tsx:798-803 の集計行、旧:
            {wk.mockCount > 0 && ` ／ ${tx(lang, `ミニ模試：${wk.mockCount}回`, `迷你模拟考：${wk.mockCount}次`)}`}
の直後（同じ <p> 内）に追加:
            {wk.conversationCount > 0 && ` ／ ${tx(lang, `AI会話：${wk.conversationCount}回`, `AI会话：${wk.conversationCount}次`)}`}

（既存テストは buildWeeklySummary をデフォルト引数で呼べるため後方互換）
