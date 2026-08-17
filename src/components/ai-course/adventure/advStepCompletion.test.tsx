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

  // 2026-08-18 更新: この約束は作り替えで置き換わった。
  // 「期限切れが0件になったら完了」は、数字の出所（旧コースのItemProgress）と
  // 復習の中身が別システムだったため**永久に成立しない条件**だった（監査P0）。
  // いまは復習が解き直しバトルとして出るので、バトルを終えれば必ず完了する。
  it('復習stepは解き直しバトルを終えたときに完了する（永久に成立しない条件を置かない）', () => {
    expect(SRC).not.toMatch(/props\.reviewsDue > 0\) return;/);
    const branch = /if \(s\.kind === 'review_due'\) \{[\s\S]{0,900}?\n {4}\}/.exec(SRC);
    expect(branch, 'review_due の分岐が見つからない').toBeTruthy();
    // fromStepIdx を渡す＝バトル終了時にこのstepが消し込まれる
    expect(branch![0]).toMatch(/fromStepIdx: i/);
  });

  it('単元のことばstepはタップしただけでは完了にしない', () => {
    const m = /if \(s\.kind === 'vocab_new' && s\.refIds\[0\]\?\.startsWith\('n3u-'\)\) \{[\s\S]{0,800}?\n {4}\}/.exec(SRC);
    expect(m, 'vocab_new の分岐が見つからない').toBeTruthy();
    // 開いた時点では完了にしない。完了は「この訪問中に単元を終えたとき」だけ
    expect(m![0]).not.toMatch(/markStep/);
    expect(m![0]).toMatch(/wasDoneBefore/);
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
    // 単元のことばは旧エリア画面へ渡すので完了の合図が返らない。ここだけ自己申告の口を残す
    expect(SRC).toMatch(/この単元のことばは学び終わった（次へ進む）/);
    expect(SRC).toMatch(/読み終わった（今日の冒険に戻る）/);
    // 復習の自己申告は撤去済み（2026-08-18）。バトルとして出るので終われば必ず完了する。
    // やっていないことを「やった」と言わせる口を残さない
    expect(SRC).not.toMatch(/復習は終わった（次へ進む）/);
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

// ── おかわりバトルが別のstepを完了にしていた（2026-08-17 監査P0） ──
//
// バトル終了時、対象が一致するstepが無ければ「未完了のバトルstepのどれか」を消していた。
// そのため おかわりバトル・错题本の解き直し・冒険マップからのバトルを1回やると、
// **やっていない語彙バトルや弱点補強が✓完了**になっていた。
describe('消し込むstepは、そのバトルを始めたstepだけ', () => {
  it('未完了のバトルstepを手当たり次第に探す実装が残っていない', () => {
    // 旧実装のフォールバック（対象一致が無いときに最初の未完了バトルstepを返す）
    expect(SRC).not.toMatch(/return quest\.steps\.findIndex\(\(s, i\) =>\s*\n?\s*\(s\.kind === 'battle' \|\| s\.kind === 'weak_reinforce'\) && !doneSteps\.has\(i\)\);/);
  });

  it('step由来のバトルだけが fromStepIdx を持つ', () => {
    expect(SRC).toMatch(/if \(!quest \|\| battle\.fromStepIdx === undefined\) return -1;/);
    // 錯題本の解き直しには付けない（今日のクエストの一部ではない）
    const mistake = /targetId: MISTAKE_TARGET_ID,[\s\S]{0,200}?\}\);/.exec(SRC);
    expect(mistake, '錯題本のsetBattleが見つからない').toBeTruthy();
    expect(mistake![0]).not.toMatch(/fromStepIdx/);
  });
});
