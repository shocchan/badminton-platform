// 体験（600円）で「届かない約束」をしていないか（2026-08-26 ファネル監査 P0）。
//
// 【背景】
// 体験の受講権は ai_start_trial で valid_until = 開始 + trial_window_minutes（60分）に
// なる。つまり体験は**実時間で同じ日のうちに終わる**。
// 一方この商品の中心は「忘れかけた頃にもう一度出す」間隔反復で、
// 復習は翌日以降に届く。この2つは正面からぶつかる。
//
// 実際に、LPの「体験でできること」に「翌日の復習が自動でつくられる」と書かれ、
// レポート画面も「次の復習: 8/27」と、体験では絶対に来ない日付を出していた。
// お金を払った人に、届かない約束を見せていたことになる。
//
// 直し方は「体験を延ばす」ではない（それは商品と価格の変更で、CEO判断）。
// **言い方を実際の仕様に合わせる**。この判断が巻き戻らないよう機械で固定する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LP } from './lpContent';

/** 体験の説明で使ってはいけない言い方（そのままだと「体験中に届く」と読める） */
const FORBIDDEN_JA = ['翌日の復習が自動でつくられる', '翌日また'];
const FORBIDDEN_ZH = ['第二天的复习会自动生成'];

describe('600円体験の説明が実際の仕様と合っている', () => {
  it('ja: 体験の中身で「翌日の復習が届く」と読める言い方をしていない', () => {
    const steps = LP.trialContents.steps.ja.join('\n');
    for (const ng of FORBIDDEN_JA) expect(steps).not.toContain(ng);
  });

  it('zh: 同上', () => {
    const steps = LP.trialContents.steps.zh.join('\n');
    for (const ng of FORBIDDEN_ZH) expect(steps).not.toContain(ng);
  });

  it('復習は「予定に入る」までを言い、届くのは続けたときだと書いてある', () => {
    expect(LP.trialContents.steps.ja.join('')).toContain('続けたとき');
    expect(LP.trialContents.steps.zh.join('')).toContain('继续之后');
  });

  it('体験の長さ（開始から60分）が注記に書いてある', () => {
    expect(LP.trialContents.note.ja).toContain('60分');
    expect(LP.trialContents.note.zh).toContain('60分');
  });

  it('時計が「体験を始める」から動くことは書いたまま（既存仕様の維持）', () => {
    expect(LP.trialContents.note.ja).toContain('体験を始める');
    expect(LP.trialContents.note.zh).toContain('开始体验');
  });
});

describe('レポート画面が体験中に来ない日付を出さない', () => {
  const REPORT = readFileSync('src/components/ai-course/CourseReport.tsx', 'utf8');
  const code = REPORT.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  it('体験中は次の復習日を出さない分岐がある', () => {
    expect(code).toContain('realtimeTrial');
    // 日付を出す2箇所とも体験中は通らないこと
    expect(code).toMatch(/realtimeTrial \? \([\s\S]{0,400}nextReviewTrial/);
    expect(code).toMatch(/data\.nextReviewISO && !realtimeTrial/);
  });

  it('体験かどうかは受講権の trial_window_minutes で判定している（推測しない）', () => {
    const page = readFileSync('src/pages/ai-lesson/AiCoursePage.tsx', 'utf8');
    expect(page).toMatch(/realtimeTrial=\{!!accessRow\?\.trialWindowMinutes\}/);
  });
});

describe('体験中に「明日また」と言わない', () => {
  const HOME = readFileSync('src/components/ai-course/CourseHome.tsx', 'utf8');
  const PAGE = readFileSync('src/pages/ai-lesson/AiCoursePage.tsx', 'utf8');

  it('ホームの上限案内が体験中は別文言になる', () => {
    expect(HOME).toContain('realtimeTrial ? th.limitReachedTrial : th.limitReached');
    expect(PAGE).toMatch(/realtimeTrial=\{!!accessRow\?\.trialWindowMinutes\}/);
  });

  it('体験用の文言に「明日」が入っていない', () => {
    const loc = readFileSync('src/locales/aiCourse.ts', 'utf8');
    const ja = /limitReachedTrial: '([^']+)'/.exec(loc)?.[1] ?? '';
    expect(ja).not.toContain('明日');
    expect(ja.length).toBeGreaterThan(0);
  });

  it('会話開始の上限側も体験中は別文言（2026-08-20の対応が残っている）', () => {
    expect(PAGE).toContain('inRealtimeTrial && dailyCapped');
  });
});
