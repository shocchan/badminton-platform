// 行き止まりを作らない配線の再発防止（2026-08-18 監査P1）。
//
// 直したのは4つ:
// ① できないstep（出題0件・音声が鳴らない・AI会話が使えない）には、どの種類でも
//    「飛ばして次へ進む」出口が出る。以前はAI会話だけで、バトル・読解・聴解は
//    その場で失敗すると今日の冒険を締めくくれないまま翌日まで詰んでいた
// ② 読解・聴解の onFinish は**記録だけ**。画面はrunnerの結果画面に留まり、
//    本人が「冒険にもどる」を押して閉じる（「結果を見る」で結果が出ないのを直す）
// ③ 中断した回はstepを完了にしない（解いたぶんは記録するが、残りは「やった」にしない）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./AdvShell.tsx', import.meta.url), 'utf8');

describe('できないstepには必ず出口がある', () => {
  it('stepNoticeの出口はAI会話専用ではない（どの種類のstepでも飛ばせる）', () => {
    const box = /\{stepNotice && \([\s\S]{0,1600}?\n {10}\)\}/.exec(SRC);
    expect(box, 'stepNoticeの表示ブロックが見つからない').toBeTruthy();
    expect(box![0]).toMatch(/このstepを飛ばして次へ進む/);
    // 「会話が使えないときだけ出す」条件に戻っていないこと
    expect(box![0]).not.toMatch(/nextStep\?\.kind === 'conversation_mission' && !props\.conversationAvailable && \(/);
  });

  it('出題0件のバトル・読解・聴解は理由つきで戻り、ホームで案内を出す', () => {
    // runner側が理由を渡し、AdvShellが受けて stepNotice を立てる
    expect(SRC).toMatch(/reason === 'no-questions' && battle\.fromStepIdx !== undefined/);
    expect(SRC).toMatch(/reason === 'audio-unavailable'/);
    // 少なくとも「バトル0件・読解0件・聴解0件・音声が鳴らない」の4つは案内が要る
    const notices = SRC.match(/下のボタンでこのstepを飛ばして、先へ進めます。/g) ?? [];
    expect(notices.length, '飛ばせる案内の数').toBeGreaterThanOrEqual(4);
  });
});

describe('読解・聴解は結果を見せてから閉じる', () => {
  it('onFinishは記録だけで画面遷移しない（結果画面はrunnerが出す）', () => {
    // onFinish の本体が recordSkillResult のあとすぐ閉じている＝setViewを挟まない
    expect(SRC).toMatch(/recordSkillResult\(prof, 'reading', r, stepIdx\);\s*\n\s*\}\}/);
    expect(SRC).toMatch(/recordSkillResult\(prof, 'listening', r, stepIdx\);\s*\n\s*\}\}/);
  });

  it('画面を閉じるのは onClose 側（理由を受け取れる形）', () => {
    expect(SRC).toMatch(/onClose=\{\(reason\) => \{/);
  });
});

describe('中断した回は「やった」ことにしない', () => {
  it('partialのバトルはstepを完了にしない', () => {
    expect(SRC).toMatch(/if \(attempt\.partial\) return -1;/);
  });

  it('partialの読解・聴解はstepを完了にしない（記録だけ残す）', () => {
    const fn = /const recordSkillResult = useCallback\([\s\S]{0,2600}?\n {2}\}, \[/.exec(SRC);
    expect(fn, 'recordSkillResult が見つからない').toBeTruthy();
    // 完了記録（withStepDone）は partial でないときだけ
    expect(fn![0]).toMatch(/r\.partial[\s\S]{0,200}withStepDone/);
    // 1問も解いていない回は台帳に入れない（0%の試行を作らない）
    expect(fn![0]).toMatch(/if \(r\.total === 0 \|\| r\.keys\.length === 0\) return;/);
  });
});
