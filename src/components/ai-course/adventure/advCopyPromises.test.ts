// 「書いてあること」と「実際に起きること」を一致させる受入テスト。2026-08-18 監査P2で新設。
//
// 有料商品なので、実装していない挙動を文言で約束すると学習者を欺くことになる。
// ここで固定するのは次の5つ。どれも実物で食い違いを確認したもの：
//   ① バトル結果の「まちがえた◯問は復習と明日の冒険に入ります」
//      → 誤答が確実に入るのは间违えた問題ノートと次のバトルの優先出題だけ
//      （語彙バトルの誤答は文法プールに解決できず、翌日の復習stepに入らない）
//   ② かなチェックの「明日から本編に入ります」→ 実際は「わかった」を押した瞬間に切り替わる
//   ③ 完了画面の「次の復習：明日・約3分」→ 明日復習があるかは何も測っていない
//   ④ 完了画面の「⭐ XP +N」→ 加算は締めくくりの1回だけ。開き直すたびに +N と出していた
//   ⑤ 週まとめの「学習時間はおおよそN分」→ 中身は 設定分数 × 学習日数（行動と無関係）
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const SHELL = read('./AdvShell.tsx');
const BATTLE = read('./AdvBattleRunner.tsx');
const KANA = read('./AdvKanaDojo.tsx');
const PAGE = read('../../../pages/ai-lesson/AiCoursePage.tsx');

describe('実装していない挙動を約束しない（文言）', () => {
  it('バトル結果は「復習と明日の冒険に入る」と約束しない', () => {
    expect(BATTLE).not.toMatch(/復習と明日の冒険に入ります/);
    expect(BATTLE).not.toMatch(/会进入复习和明天的冒险/);
    // 代わりに、実際に必ず起きること（ノートに残る・次のバトルで優先再出題）を言う
    expect(BATTLE).toMatch(/間違えた問題ノート/);
    expect(BATTLE).toMatch(/错题本/);
  });

  it('かなチェックの結果は「明日から」と言わない（その場で切り替わるため）', () => {
    expect(KANA).not.toMatch(/明日から本編に入ります/);
    expect(KANA).not.toMatch(/明日から1日2行/);
    expect(KANA).not.toMatch(/明天开始进入正式学习/);
    expect(KANA).not.toMatch(/从明天开始每天学2行/);
  });

  it('完了画面の「次の復習」は根拠のない「明日・約3分」を断定しない', () => {
    expect(SHELL).not.toMatch(/'明日・約3分', '明天・约3分钟'/);
    // 実測から出す。しかも**実際に解き直せる問題だけ**を数える（2026-08-18 検証で強化）。
    // 錯題本には読解・聴解・模試の誤答も載るが、それらは解き直しバトルのプールに解決できない。
    // 全部数えると「5問あります」と言って押すと2問しか出ない、という食い違いになる
    expect(SHELL).toMatch(/const completeMistakePending = \(\(\) => \{/);
    expect(SHELL).toMatch(/const pending = pendingMistakeKeySet\(notebook\);/);
    expect(SHELL).toMatch(/for \(const qs of pools\.byItem\.values\(\)\)[\s\S]{0,120}?pending\.has\(q\.key\)/);
  });

  it('週まとめは計測していない「学習時間」を出さない', () => {
    expect(SHELL).not.toMatch(/学習時間はおおよそ/);
    // 週まとめの推定分数は撤去（quest.estimatedMinutes＝今日の予定時間は別物なので触らない）
    expect(SHELL).not.toMatch(/wk\.estimatedMinutes/);
    // 実測している「解いた問題数」に置き換わっている
    expect(SHELL).toMatch(/wk\.solvedQuestions/);
  });
});

describe('完了画面のXPは、実際に加算した回だけ「+N」と出す', () => {
  it('再表示のたびに doneSteps.size × 15 を「+N」として出さない', () => {
    expect(SHELL).not.toMatch(/XP \+\{doneSteps\.size \* XP_RULES\.questStep\}/);
  });

  it('締めくくりで加算した値を持ち、まとめの見直しでは消す', () => {
    expect(SHELL).toMatch(/setJustEarnedXp\(earned\)/);
    expect(SHELL).toMatch(/setJustEarnedXp\(null\); setView\('complete'\)/);
    expect(SHELL).toMatch(/justEarnedXp !== null \? `⭐ XP \+\$\{justEarnedXp\}`/);
  });
});

describe('「（次へ進む）」と書いたリンクは、実際に次のstepへ入る', () => {
  it('markStep だけしてホームに留まる実装が残っていない', () => {
    expect(SHELL).not.toMatch(/onClick=\{\(\) => \{ markStep\(nextStepIdx\); \}\}/);
    expect(SHELL).not.toMatch(/onClick=\{\(\) => \{ markStep\(nextStepIdx\); setStepNotice\(null\); \}\}/);
  });

  it('自己申告リンクは markStepAndGoNext を通る', () => {
    const calls = SHELL.match(/markStepAndGoNext\(nextStepIdx\)/g) ?? [];
    // 単元のことば／AI会話（常設）／AI会話（stepNotice内）。増減はありうるが、無くなったら壊れている
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // 次のstepが無い日はホームに残る（締めくくりCTAを出す）＝行き止まりにしない
    expect(SHELL).toMatch(/if \(nextIdx >= 0\) runStep\(nextIdx\);/);
  });
});

describe('「今日の冒険を開始した」は、実際にstepが開けたときだけ数える', () => {
  it('計上は1か所だけで、openStep が成功したあとにある', () => {
    const occurrences = SHELL.match(/trackAdv\('today_quest_started'/g) ?? [];
    expect(occurrences.length).toBe(1);
    const guard = SHELL.indexOf('if (!openStep(i)) return;');
    const track = SHELL.indexOf("trackAdv('today_quest_started'");
    expect(guard).toBeGreaterThan(-1);
    expect(track).toBeGreaterThan(guard);
  });

  it('開けなかった分岐は false を返す（AI会話が使えない・解き直す問題が無い）', () => {
    expect(SHELL).toMatch(/const openStep = \(i: number\): boolean =>/);
    const branch = /if \(s\.kind === 'conversation_mission'\) \{[\s\S]{0,600}?\n {4}\}/.exec(SHELL);
    expect(branch, 'conversation_mission の分岐が見つからない').toBeTruthy();
    expect(branch![0]).toMatch(/return false;/);
  });
});

describe('使っていない配線を残さない（言い直し）', () => {
  it('AdvShell は onStartRestate / restateAvailable を受け取らない', () => {
    expect(SHELL).not.toMatch(/^\s*onStartRestate: \(\) => void;/m);
    expect(SHELL).not.toMatch(/^\s*restateAvailable: boolean;/m);
    expect(SHELL).not.toMatch(/props\.onStartRestate/);
    expect(SHELL).not.toMatch(/props\.restateAvailable/);
  });

  it('AiCoursePage は AdvShell へ渡さない（旧コースの buildLightSession を毎描画で走らせない）', () => {
    expect(PAGE).not.toMatch(/onStartRestate=/);
    expect(PAGE).not.toMatch(/restateAvailable=/);
  });
});

describe('AI会話後のレポートに旧世界（ミナモ列島）を出さない', () => {
  it('カタリ港の一文はV2では渡さない', () => {
    expect(PAGE).toMatch(/worldLineJa=\{advOn \? undefined : t\.katari\.fogClearedToday\}/);
  });

  it('旧コース12週エンジンの「次のミッション／次にできるようになること」もV2では出さない', () => {
    expect(PAGE).toMatch(/nextMissionLabel: advOnNow \? null : \(nextMission\?\.targetExpression \?\? null\)/);
    expect(PAGE).toMatch(/nextAbility: advOnNow \? null : nextAbilityDef/);
  });
});
