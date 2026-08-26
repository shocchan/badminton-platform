// 販売LPの並び順（2026-08-26 CEO指示 Phase S3〜S5）。
//
// 【何を守るか】
// 直前まで、価格表が6番目・人間コーチの紹介が9番目だった。
// つまり読む人は、この商品の**唯一の代替できない部分**を見る前に金額を見ていた。
// 中国語圏には安価で高機能なAI会話アプリが大量にあるので、その状態で価格を出すと
// 「AIアプリなのに高い」という比較で終わる。
//
// 並び替えは1行の移動で戻せてしまうので、順序そのものをテストで固定する。
// セクションを増やすのは自由だが、**この前後関係だけは崩さない**。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LP } from './lpContent';
import { planById } from '../../../lib/aiLesson/course/plans/planCatalog';

const PAGE = readFileSync('src/pages/ai-lesson/landing/AiCourseLandingPage.tsx', 'utf8');

/** JSXに現れる順にセクション名を並べる（コメント行は除く） */
const order = (): string[] => {
  const body = PAGE.split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\s*\/\*)/.test(l))
    .join('\n');
  const main = /<main>([\s\S]*?)<\/main>/.exec(body);
  expect(main, '<main> が見つからない').toBeTruthy();
  return [...main![1].matchAll(/<([A-Z][A-Za-z]+)\b/g)].map((m) => m[1]);
};

const idx = (name: string): number => {
  const i = order().indexOf(name);
  expect(i, `${name} がLPに無い`).toBeGreaterThanOrEqual(0);
  return i;
};

describe('「なぜこれを選ぶか」を理解してから値段を見る', () => {
  it('人間コーチの紹介が価格表より前にある', () => {
    // これがこの並び替えの中心。逆に戻すと、AIアプリと横並びで価格比較される
    expect(idx('HumanCoachSection')).toBeLessThan(idx('PricingSection'));
  });

  it('AIアプリだけでは足りない理由が、仕組みの説明より前にある', () => {
    expect(idx('WhyNotAiOnlySection')).toBeLessThan(idx('PlatformFeatures'));
  });

  it('悩み → 日本生活の場面 → なぜAIだけでは足りないか の順', () => {
    expect(idx('PainPointsSection')).toBeLessThan(idx('LifeScenesSection'));
    expect(idx('LifeScenesSection')).toBeLessThan(idx('WhyNotAiOnlySection'));
  });

  it('AIと人の役割 → コーチ紹介 の順（役割を説明してから、その人を出す）', () => {
    expect(idx('AiHumanRolesSection')).toBeLessThan(idx('HumanCoachSection'));
  });

  it('600円体験の中身が価格表より前にある', () => {
    expect(idx('TrialContentsSection')).toBeLessThan(idx('PricingSection'));
  });

  it('比較・向き不向き・受講生・FAQ は価格表より後ろ', () => {
    for (const s of ['PlanComparisonSection', 'PlanFitSection', 'TestimonialsSection', 'FaqSection']) {
      expect(idx(s)).toBeGreaterThan(idx('PricingSection'));
    }
  });

  it('最終CTAが最後にある（行き止まりを作らない）', () => {
    const o = order();
    expect(o[o.length - 1]).toBe('FinalCtaSection');
  });

  it('並び替えでセクションを落としていない', () => {
    // 既存の12セクション＋新設1つ。減っていたら「順番を直したつもりで消した」
    for (const s of [
      'AiCourseHero', 'PriceTeaserStrip', 'PainPointsSection', 'LifeScenesSection',
      'WhyNotAiOnlySection', 'PlatformFeatures', 'AiHumanRolesSection', 'HumanCoachSection',
      'DailyLearningFlow', 'TrialContentsSection', 'SixMonthRoadmap', 'PricingSection',
      'PlanComparisonSection', 'PlanFitSection', 'TestimonialsSection', 'FaqSection', 'FinalCtaSection',
    ]) {
      expect(order(), `${s} が消えている`).toContain(s);
    }
  });
});

describe('AIアプリとの違いを、競合を攻撃せずに書く', () => {
  const all = [LP.whyNotAiOnly.heading, LP.whyNotAiOnly.lead, LP.whyNotAiOnly.close]
    .flatMap((x) => [x.ja, x.zh])
    .concat(LP.whyNotAiOnly.items.ja.flatMap((i) => [i.gap, i.body]))
    .concat(LP.whyNotAiOnly.items.zh.flatMap((i) => [i.gap, i.body]))
    .join('\n');

  it('競合サービス名を出していない', () => {
    for (const name of ['星空', '可栗', '咕噜', 'Duolingo', 'Speak', '早道', '沪江', '新东方']) {
      expect(all, `競合名「${name}」を出さない`).not.toContain(name);
    }
  });

  it('他社を断定的に否定する言い方をしていない', () => {
    for (const ng of ['他社', '劣', '無駄', '意味がない', '没用', '骗']) {
      expect(all, `「${ng}」は使わない`).not.toContain(ng);
    }
  });

  it('4つの理由がja/zhとも同じ数だけある（片方だけ足すと訳が抜ける）', () => {
    expect(LP.whyNotAiOnly.items.ja.length).toBe(LP.whyNotAiOnly.items.zh.length);
    expect(LP.whyNotAiOnly.items.ja.length).toBeGreaterThanOrEqual(3);
  });

  it('最後の一文がコーチ紹介へ渡している（並びの意味を言葉にする）', () => {
    expect(LP.whyNotAiOnly.close.ja).toContain('人');
    expect(LP.whyNotAiOnly.close.zh).toContain('真人');
  });
});

describe('プランの位置づけ（Phase S4/S5）', () => {
  it('月額プランは「人のレッスンが要らない人向け」と書いてある', () => {
    const m = planById('ai-month')!;
    expect(m.audienceJa).toContain('人のレッスンは要らない');
    expect(m.audienceZh).toContain('不需要真人课程');
  });

  it('6か月コースは回数の足し算ではなく伴走として書いてある', () => {
    const c = planById('coach-6m')!;
    expect(c.descriptionJa).toContain('いっしょに進みます');
    // 「日本で暮らしながら」＝この商品が誰のためかが説明に入っていること
    expect(c.descriptionJa).toContain('日本で暮らし');
    expect(c.descriptionZh).toContain('在日本生活');
  });

  it('6か月コースの説明で上達を保証していない', () => {
    const c = planById('coach-6m')!;
    for (const ng of ['必ず', '保証', '确保', '保证']) {
      expect(c.descriptionJa + c.descriptionZh, `「${ng}」は使わない`).not.toContain(ng);
    }
  });

  it('3プランの選び分けがLPの言葉で書いてある', () => {
    expect(LP.planFit.lead.ja).toContain('まず試したい');
    expect(LP.planFit.lead.ja).toContain('自分のペース');
    expect(LP.planFit.lead.zh).toContain('先试试');
  });

  it('今回の変更で値段を動かしていない（版の指紋が価格を含めて固定している）', () => {
    // 金額そのものはここに書かない（planCatalog.ts が正準。ハードコードのガードに引っかかる）。
    // 価格が変わったかどうかは planCatalog.test.ts の PLAN_FINGERPRINTS が検出する。
    // ここでは「3プランとも値が付いていて、順序関係が壊れていない」だけを見る
    const trial = planById('ai-trial-pass')!.priceJpy!;
    const month = planById('ai-month')!.priceJpy!;
    const coach = planById('coach-6m')!.priceJpy!;
    expect(trial).toBeGreaterThan(0);
    expect(month).toBeGreaterThan(trial);
    expect(coach).toBeGreaterThan(month);
  });
});
