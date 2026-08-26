// 600円体験の説明が、実際の仕様と合っているか。
//
// 【この一日で二度書き換わっている。経緯を残す】
// 2026-08-26 午前:
//   体験は「体験を始める」から**実時間60分**で切れる仕様だった。
//   ところが LP は「翌日の復習が自動でつくられる」と書き、レポートは
//   「次の復習: 8/27」という**体験では絶対に来ない日付**を出していた。
//   お金を払った人に届かない約束を見せていたので、**言い方**を仕様に寄せた。
//
// 2026-08-26 午後（CEO指示 Phase S2）:
//   逆向きの判断。**仕様のほう**を直した。体験を開始から7日間にして、
//   間隔反復（＝この商品の中心）を体験できるようにした。
//   実測: 唯一の体験購入者は4個が復習予定に入り、1個も受け取れていない。
//
// したがってこのテストが守るのは「60分と書くこと」でも「7日と書くこと」でもなく、
// **カタログ（planCatalog）と画面の文言がずれないこと**。
// 期間をまた変えるなら、カタログを直せばここが落ちて全部の文言に気づける。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LP } from './lpContent';
import { planById } from '../../../lib/aiLesson/course/plans/planCatalog';

const TRIAL = planById('ai-trial-pass')!;

describe('体験の期間が、カタログと画面で一致している', () => {
  it('カタログは日数制（実時間制と二重に持たない）', () => {
    expect(TRIAL.trialDays, '体験の日数がカタログに無い').toBeTruthy();
    expect(TRIAL.realtimeWindowMinutes, '日数制と実時間制を同時に持たせない').toBeNull();
  });

  it('LPの注記にカタログと同じ日数が書いてある', () => {
    const days = String(TRIAL.trialDays);
    expect(LP.trialContents.note.ja).toContain(`${days}日間`);
    expect(LP.trialContents.note.zh).toContain(`${days}天`);
  });

  it('FAQの回答もカタログと同じ日数を言っている（LPの中で食い違わせない）', () => {
    const days = String(TRIAL.trialDays);
    const faqJa = LP.faq.items.ja.map((f) => f.a).join('\n');
    const faqZh = LP.faq.items.zh.map((f) => f.a).join('\n');
    expect(faqJa).toContain(`${days}日間`);
    expect(faqZh).toContain(`${days}天`);
    // 旧仕様の数字が残っていないこと
    expect(faqJa).not.toContain('開始から60分');
    expect(faqZh).not.toContain('开始后的60分钟');
  });

  it('体験の中身に「翌日の復習」が入っている（日数制にした理由そのもの）', () => {
    const stepsJa = LP.trialContents.steps.ja.join('');
    const stepsZh = LP.trialContents.steps.zh.join('');
    expect(stepsJa).toContain('翌日');
    expect(stepsZh).toContain('第二天');
  });

  it('「届くのは続けたとき」という旧仕様向けの但し書きが残っていない', () => {
    // 7日あるので体験中に届く。残っていると、逆向きの嘘になる
    expect(LP.trialContents.steps.ja.join('')).not.toContain('続けたとき');
    expect(LP.trialContents.steps.zh.join('')).not.toContain('继续之后才会送到');
  });

  it('時計が「体験を始める」から動くことは書いたまま（既存仕様の維持）', () => {
    expect(LP.trialContents.note.ja).toContain('体験を始める');
    expect(LP.trialContents.note.zh).toContain('开始体验');
  });

  it('音声会話の回数が書いてある（日数制では回数のほうが上限）', () => {
    expect(LP.trialContents.note.ja).toContain('3回');
    expect(LP.trialContents.note.zh).toContain('3次');
  });
});

describe('復習日の見せ方が受講権の実態に従う', () => {
  const REPORT = readFileSync('src/components/ai-course/CourseReport.tsx', 'utf8');
  const PAGE = readFileSync('src/pages/ai-lesson/AiCoursePage.tsx', 'utf8');
  const ACCESS = readFileSync('src/lib/aiLesson/course/courseAccess.ts', 'utf8');
  const HOME = readFileSync('src/components/ai-course/CourseHome.tsx', 'utf8');

  it('「翌日が来ない体験か」の判定が1か所にある', () => {
    // 画面ごとに trial_window_minutes を直接見ていると、仕様を変えた後も
    // 「体験は今日まで」と言い続ける画面が必ず残る
    expect(ACCESS).toContain('export const reviewUnreachable');
    expect(ACCESS).toMatch(/trialShapeOf\(row\)\.kind === 'minutes'/);
  });

  it('レポートとホームは、その判定だけを見る（自前で推測しない）', () => {
    expect(PAGE).toContain('realtimeTrial={reviewUnreachable(accessRow)}');
    expect(PAGE).not.toMatch(/realtimeTrial=\{!!accessRow\?\.trialWindowMinutes\}/);
    expect(REPORT).toContain('realtimeTrial');
    expect(HOME).toContain('realtimeTrial ? th.limitReachedTrial : th.limitReached');
  });

  it('日数制では復習日を隠さない（届くのに隠すのは逆向きの嘘）', () => {
    // reviewUnreachable が minutes のときだけ true ＝ 7日制では通常表示に戻る
    expect(ACCESS).toMatch(/reviewUnreachable[\s\S]{0,200}'minutes'/);
  });

  it('会話開始の残時間ガードは実時間制のときだけ効く', () => {
    // 7日制で「残り4分未満だから会話を出さない」は起きえない
    expect(PAGE).toMatch(/trialTooShortForConversation[\s\S]{0,300}reviewUnreachable\(accessRow\)/);
  });
});

describe('体験用の文言に「明日」を書かない（旧仕様の受講権が残っているため）', () => {
  it('上限案内の体験用文言に「明日」が入っていない', () => {
    const loc = readFileSync('src/locales/aiCourse.ts', 'utf8');
    const ja = /limitReachedTrial: '([^']+)'/.exec(loc)?.[1] ?? '';
    expect(ja.length).toBeGreaterThan(0);
    expect(ja).not.toContain('明日');
  });

  it('会話開始の上限側も体験中は別文言（2026-08-20の対応が残っている）', () => {
    const PAGE = readFileSync('src/pages/ai-lesson/AiCoursePage.tsx', 'utf8');
    expect(PAGE).toContain('inRealtimeTrial && dailyCapped');
  });
});
