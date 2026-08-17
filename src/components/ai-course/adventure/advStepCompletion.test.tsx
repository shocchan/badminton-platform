// 「開いただけで完了になる」ことの再発防止。2026-08-17 CEO実機報告。
//
// 報告: 復習と新しい文法をやる前にページを戻ったら、両方とも✓（完了）になっていた。
// 原因は2つとも「タップ／表示された瞬間に markStep していた」こと。
// やっていないことを「やった」と記録すると、
//   ・毎日の完了ログ（questLog）と週まとめの数字が実態とずれる（原則13）
//   ・翌日そのstepが二度と出てこない（学ばないまま先へ進む）
// ので、完了は**本人の行動**か**実測できる結果**にだけ紐づける。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./AdvShell.tsx', import.meta.url), 'utf8');

describe('完了の記録は「やった」ときだけ', () => {
  it('復習stepはタップしただけでは完了にしない', () => {
    // runStep の review_due 分岐に markStep が無いこと
    const m = /if \(s\.kind === 'review_due'\)[^\n]*\n/.exec(SRC);
    expect(m, 'review_due の分岐が見つからない').toBeTruthy();
    expect(m![0]).not.toMatch(/markStep/);
  });

  it('復習stepは「期限切れが0件になった」実測で完了する', () => {
    expect(SRC).toMatch(/props\.reviewsDue > 0\) return;[\s\S]{0,200}kind === 'review_due'/);
  });

  it('単元のことばstepはタップしただけでは完了にしない', () => {
    const m = /if \(s\.kind === 'vocab_new' && s\.refIds\[0\]\?\.startsWith\('n3u-'\)\) \{[\s\S]{0,400}?\n    \}/.exec(SRC);
    expect(m, 'vocab_new の分岐が見つからない').toBeTruthy();
    expect(m![0]).not.toMatch(/markStep/);
  });

  it('**文法の教材は表示された瞬間に完了にしない**（本人が押したときだけ）', () => {
    // 旧実装: useEffect(() => { if (doc) onLearned(); }, [doc])
    expect(SRC).not.toMatch(/if \(doc\) onLearned\(\)/);
    // 完了はボタン経由だけ
    const calls = SRC.match(/onLearned\(\)/g) ?? [];
    expect(calls.length, 'onLearned の呼び出し箇所').toBe(2);   // バトルへ進む／読み終わった
    expect(SRC).toMatch(/onClick=\{\(\) => \{ onLearned\(\); onBattle\(\); \}\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => \{ onLearned\(\); onBack\(\); \}\}/);
  });

  it('別画面へ渡すstepには、本人が終わりを言える出口がある（行き止まりにしない）', () => {
    expect(SRC).toMatch(/復習は終わった（次へ進む）/);
    expect(SRC).toMatch(/この単元のことばは学び終わった（次へ進む）/);
    expect(SRC).toMatch(/読み終わった（今日の冒険に戻る）/);
  });
});

// ── 復習画面の「次へ」（2026-08-17 CEO実機報告: 押しても画面が切り替わらない） ──
//
// 「次へ：復習 3件」と表示され、押すと同じ復習画面が開き直っていた。
// 素の nextStepIdx は**復習step自身**を指す（復習は期限切れが0件になるまで未完了のまま）。
// 復習画面から出す「次へ」は、復習を除いた次のstepでなければならない。
describe('復習画面の「次へ」は復習step自身を指さない', () => {
  it('親へ知らせる次のstepは review_due を除いて求めている', () => {
    expect(SRC).toMatch(/nextAfterReviewIdx = useMemo\([\s\S]{0,200}kind !== 'review_due'/);
    // 通知に使うのは nextAfterReview（素の nextStep ではない）
    expect(SRC).toMatch(/const nextTitleJa = nextAfterReview\?\.titleJa/);
    expect(SRC).toMatch(/const nextTitleZh = nextAfterReview\?\.titleZh/);
  });

  it('「次へ」で実行するstepも review_due を除いたもの', () => {
    expect(SRC).toMatch(/const idx = nextAfterReviewIdx;/);
    // 素の nextStepIdx をそのまま実行していたら、また同じ画面が開く
    expect(SRC).not.toMatch(/const idx = nextStepIdx;/);
  });
});
