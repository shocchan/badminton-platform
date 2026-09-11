// 販売LPの並び順。
//
// 2026-08-26（Phase S3〜S5）: 「なぜこれを選ぶのかを理解してから値段を見る」順に。
// 2026-09-11（LP圧縮・CEO承認 docs/ai-course/audit/LP_READABILITY_AUDIT_2026-09-11.md）:
//   29画面→約18画面。同じ主張の2回目・3回目（比較表・役割の別節・向き不向き・料金の帯・毎日の流れ）を
//   統合または削除し、受講生の声を料金の直前へ、ロードマップを料金の後へ。同じ主CTAを約3画面ごとに置く。
//
// 並び替えは1行の移動で戻せてしまうので、順序そのものをテストで固定する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LP } from './lpContent';
import { planById } from '../../../lib/aiLesson/course/plans/planCatalog';

const PAGE = readFileSync('src/pages/ai-lesson/landing/AiCourseLandingPage.tsx', 'utf8');

/** JSXに現れる順にセクション名を並べる（コメント行は除く） */
const order = (): string[] => {
  const body = PAGE.split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\s*\/\*|[①-⑫]|→)/.test(l))
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
    expect(idx('HumanCoachSection')).toBeLessThan(idx('PricingSection'));
  });

  it('AIアプリだけでは足りない理由（＋人×AIの役割）が、仕組みの説明より前にある', () => {
    expect(idx('WhyNotAiOnlySection')).toBeLessThan(idx('PlatformFeatures'));
  });

  it('悩み → 日本生活の場面 → なぜAIだけでは足りないか の順', () => {
    expect(idx('PainPointsSection')).toBeLessThan(idx('LifeScenesSection'));
    expect(idx('LifeScenesSection')).toBeLessThan(idx('WhyNotAiOnlySection'));
  });

  it('役割（WhyNotAiOnly の中）→ コーチ紹介 の順', () => {
    expect(idx('WhyNotAiOnlySection')).toBeLessThan(idx('HumanCoachSection'));
  });

  it('600円体験の中身 → 受講生の声 → 価格表 の順（決める直前に安心材料）', () => {
    expect(idx('TrialContentsSection')).toBeLessThan(idx('TestimonialsSection'));
    expect(idx('TestimonialsSection')).toBeLessThan(idx('PricingSection'));
  });

  it('6か月ロードマップと FAQ は価格表より後ろ', () => {
    for (const s of ['SixMonthRoadmap', 'FaqSection']) {
      expect(idx(s)).toBeGreaterThan(idx('PricingSection'));
    }
  });

  it('最終CTAが最後にある（行き止まりを作らない）', () => {
    const o = order();
    expect(o[o.length - 1]).toBe('FinalCtaSection');
  });

  it('残す節を落としていない／統合・削除した節を戻していない', () => {
    const o = order();
    for (const s of [
      'AiCourseHero', 'PainPointsSection', 'LifeScenesSection', 'WhyNotAiOnlySection', 'HumanCoachSection',
      'PlatformFeatures', 'TrialContentsSection', 'TestimonialsSection', 'PricingSection', 'SixMonthRoadmap',
      'FaqSection', 'FinalCtaSection',
    ]) expect(o, `${s} が消えている`).toContain(s);
    for (const s of ['PriceTeaserStrip', 'AiHumanRolesSection', 'DailyLearningFlow', 'PlanComparisonSection', 'PlanFitSection']) {
      expect(o, `${s} は統合・削除済み（戻すなら監査をやり直す）`).not.toContain(s);
    }
  });

  it('同じ主CTAを途中に3回置く（場面の後・コーチの後・体験の中身の後）', () => {
    const o = order();
    expect(o.filter((s) => s === 'MidCta')).toHaveLength(3);
    expect(idx('LifeScenesSection')).toBeLessThan(o.indexOf('MidCta'));
    expect(o.lastIndexOf('MidCta')).toBeLessThan(idx('TestimonialsSection'));
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

  it('理由がja/zhとも同じ数だけある（片方だけ足すと訳が抜ける）', () => {
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
    expect(c.descriptionJa).toContain('日本で暮らし');
    expect(c.descriptionZh).toContain('在日本生活');
  });

  it('6か月コースの説明で上達を保証していない', () => {
    const c = planById('coach-6m')!;
    for (const ng of ['必ず', '保証', '确保', '保证']) {
      expect(c.descriptionJa + c.descriptionZh, `「${ng}」は使わない`).not.toContain(ng);
    }
  });

  it('3プランの選び分けの1行目が料金カードに出る（旧「あなたに合うプラン」の統合先）', () => {
    expect(LP.planFit.lead.ja).toContain('まず試したい');
    expect(LP.planFit.lead.ja).toContain('自分のペース');
    expect(LP.planFit.lead.zh).toContain('先试试');
    const D = readFileSync('src/pages/ai-lesson/landing/sectionsD.tsx', 'utf8');
    expect(D).toMatch(/LP\.planFit\.byPlan\[lang\]\[view\.id\]/);
  });

  it('今回の変更で値段を動かしていない（版の指紋が価格を含めて固定している）', () => {
    const trial = planById('ai-trial-pass')!.priceJpy!;
    const month = planById('ai-month')!.priceJpy!;
    const coach = planById('coach-6m')!.priceJpy!;
    expect(trial).toBeGreaterThan(0);
    expect(month).toBeGreaterThan(trial);
    expect(coach).toBeGreaterThan(month);
  });
});

describe('CTA と画面写真（2026-09-11 LP圧縮）', () => {
  const HERO = readFileSync('src/pages/ai-lesson/landing/AiCourseHero.tsx', 'utf8');
  const FUNNEL = readFileSync('src/pages/ai-lesson/landing/lpFunnel.tsx', 'utf8');
  const B = readFileSync('src/pages/ai-lesson/landing/sectionsB.tsx', 'utf8');
  const C = readFileSync('src/pages/ai-lesson/landing/sectionsC.tsx', 'utf8');

  it('ヒーローの主CTAは1つ。相談はテキストリンク、3つ目のボタンとチップは無い', () => {
    expect(HERO).not.toMatch(/LP\.ctaSecondary/);
    expect(HERO).not.toMatch(/LP\.heroChips/);
    expect(HERO).toMatch(/\{trial && \(\s*<button type="button"[\s\S]*?LP\.ctaPrimary\[lang\]/);
  });

  it('固定バーは主CTA1つだけ（相談ボタンを並べない）', () => {
    const sticky = FUNNEL.slice(FUNNEL.indexOf('export function LpStickyCta'));
    expect(sticky).not.toMatch(/stickyBar\.consult/);
    expect(sticky).toMatch(/LP\.ctaTrial\[lang\]/);
  });

  it('途中のCTAも同じ文言（ctaTrial）を使う', () => {
    const mid = FUNNEL.slice(FUNNEL.indexOf('export function MidCta'), FUNNEL.indexOf('export function LpStickyCta'));
    expect(mid).toMatch(/LP\.ctaTrial\[lang\]\.replace\('\{price\}'/);
  });

  it('画面写真4枚は横スクロールではなく縦に並ぶ（スマホで2枚目以降も見える）', () => {
    const screens = B.slice(B.indexOf('function RealScreens'), B.indexOf('export function PlatformFeatures'));
    expect(screens).not.toMatch(/overflow-x-auto|snap-x/);
    expect(screens).toMatch(/flex-col/);
    // 画面が機能の一覧より先（主役）
    const pf = B.slice(B.indexOf('export function PlatformFeatures'));
    expect(pf.indexOf('<RealScreens')).toBeLessThan(pf.indexOf('LP.features.items[lang]'));
  });

  it('コーチ紹介は本人の一言が主役で、経歴の箇条書きは2行まで', () => {
    expect(C).toMatch(/c\.message\[lang\]/);
    expect(C).toMatch(/c\.facts\[lang\]\.slice\(0, 2\)/);
    // 本人の一言は事実だけで組む（体験談の創作をしない）: facts と同じ語が入っていること
    expect(LP.humanCoach.message.ja).toMatch(/日本語指導|設計・開発/);
    expect(LP.humanCoach.message.zh.length).toBeGreaterThan(20);
  });
});
