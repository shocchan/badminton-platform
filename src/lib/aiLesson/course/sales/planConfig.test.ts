// 商品定義の受入テスト（§17 §2 §20）。
//
// ここで守りたいのは3つ。
//   1. 価格が **1か所にしか無い**（別々の価格が同時に画面へ出る事故を止める）
//   2. §17 の必須項目が全部そろっている
//   3. 根拠のない煽り文句が入り込まない

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  SALES_PLAN_CATALOG, allSalesPlans, visibleSalesPlans, purchasableSalesPlans,
  salesPlanById, acceptsPurchase, isPlansPreview, plansForDisplay, isTimedPlan,
  hasHumanSupport, formatPlanPrice, formatTaxNote, ctaLabelFor, salesPlanView,
  BANNED_SALES_CLAIMS, type SalesPlanConfig,
} from './planConfig';

const hourPass = salesPlanById('ai-hour-pass')!;
const month = salesPlanById('ai-month')!;
const coach = salesPlanById('coach-6m')!;

describe('カタログの基本構造', () => {
  it('3プランが比較できる状態で並ぶ（§20 完了条件1）', () => {
    const plans = visibleSalesPlans();
    expect(plans.map((p) => p.planId)).toEqual(['ai-hour-pass', 'ai-month', 'coach-6m']);
  });

  it('planId が重複しない', () => {
    const ids = SALES_PLAN_CATALOG.map((p) => p.planId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sortOrder が重複しない（表示順が実行ごとにぶれない）', () => {
    const orders = SALES_PLAN_CATALOG.map((p) => p.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('未知のplanIdは null（存在しない商品を買わせない）', () => {
    expect(salesPlanById('no-such-plan')).toBeNull();
  });
});

describe('§17 必須項目', () => {
  const REQUIRED: (keyof SalesPlanConfig)[] = [
    'planId', 'status', 'nameJa', 'nameZh', 'priceAmount', 'currency', 'taxIncluded',
    'durationDays', 'includedActiveMinutes', 'validityDays', 'autoRenew', 'humanLessonCount',
    'ctaMode', 'featuresJa', 'featuresZh', 'upgradeTargetPlanId', 'repeatPurchaseEnabled',
    'upgradeCreditEnabled', 'upgradeCreditAmount', 'upgradeCreditValidDays',
    'idlePauseSeconds', 'heartbeatSeconds', 'usageWarningThresholdMinutes',
    'upsellRules', 'version', 'effectiveFrom',
  ];

  it('全プランが必須項目を持つ', () => {
    for (const p of SALES_PLAN_CATALOG) {
      for (const key of REQUIRED) {
        expect(Object.prototype.hasOwnProperty.call(p, key), `${p.planId}.${String(key)}`).toBe(true);
        expect(p[key], `${p.planId}.${String(key)}`).not.toBeUndefined();
      }
    }
  });

  it('effectiveFrom は YYYY-MM-DD', () => {
    for (const p of SALES_PLAN_CATALOG) expect(p.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('version は 1 以上の整数', () => {
    for (const p of SALES_PLAN_CATALOG) {
      expect(Number.isInteger(p.version)).toBe(true);
      expect(p.version).toBeGreaterThanOrEqual(1);
    }
  });

  it('ja と zh が両方そろう（片方だけ更新して言語が欠ける事故を止める）', () => {
    for (const p of SALES_PLAN_CATALOG) {
      expect(p.nameZh.length, p.planId).toBeGreaterThan(0);
      expect(p.taglineZh.length, p.planId).toBeGreaterThan(0);
      expect(p.featuresZh.length, p.planId).toBe(p.featuresJa.length);
      expect(p.limitationsZh.length, p.planId).toBe(p.limitationsJa.length);
    }
  });
});

describe('§1 商品構成が仕様どおり', () => {
  it('60分パス: 累計60分・自動更新なし・人間レッスンなし・再購入可', () => {
    expect(hourPass.includedActiveMinutes).toBe(60);
    expect(hourPass.autoRenew).toBe(false);
    expect(hourPass.humanLessonCount).toBe(0);
    expect(hourPass.repeatPurchaseEnabled).toBe(true);
    expect(hourPass.ctaMode).toBe('checkout');
  });

  it('1か月プラン: 固定1か月・自動更新なし・人間レッスンなし', () => {
    expect(month.durationDays).toBe(30);
    expect(month.autoRenew).toBe(false);
    expect(month.humanLessonCount).toBe(0);
    expect(month.ctaMode).toBe('checkout');
  });

  it('6か月伴走のみ人間対応があり、相談導線（その場購入ではない）', () => {
    expect(coach.humanLessonCount).toBe(24);
    expect(coach.ctaMode).toBe('consult');
    expect(hasHumanSupport(coach)).toBe(true);
    expect(hasHumanSupport(hourPass)).toBe(false);
    expect(hasHumanSupport(month)).toBe(false);
  });

  it('60分と1か月は相談・見積り・手動招待を必須にしない（§1末尾・§20 完了条件2）', () => {
    // 「相談してから」しか進めない設計になっていないことを ctaMode で固定する
    expect(hourPass.ctaMode).not.toBe('consult');
    expect(month.ctaMode).not.toBe('consult');
  });

  it('全プランが自動更新なしで始まる（§1）', () => {
    for (const p of SALES_PLAN_CATALOG) expect(p.autoRenew, p.planId).toBe(false);
  });
});

describe('§12 アップグレード充当は既定OFF', () => {
  it('勝手に有効化されていない', () => {
    for (const p of SALES_PLAN_CATALOG) expect(p.upgradeCreditEnabled, p.planId).toBe(false);
  });
  it('OFFでも金額と有効日数の設定枠は用意されている（ONにするとき数値を探し回らない）', () => {
    expect(hourPass.upgradeCreditAmount).toBeGreaterThan(0);
    expect(hourPass.upgradeCreditValidDays).toBeGreaterThan(0);
  });
});

describe('§16 原価の想定が有限（600円でも赤字にしない）', () => {
  it('音声とレポートに必ず上限がある', () => {
    for (const p of SALES_PLAN_CATALOG) {
      expect(p.cost.voiceMinutesCap, p.planId).toBeGreaterThan(0);
      expect(Number.isFinite(p.cost.voiceMinutesCap)).toBe(true);
      expect(p.cost.aiReportCap, p.planId).toBeGreaterThan(0);
      expect(Number.isFinite(p.cost.aiReportCap)).toBe(true);
    }
  });
  it('60分パスの音声上限は、含まれる学習時間より短い（原価の主因を抑える）', () => {
    expect(hourPass.cost.voiceMinutesCap).toBeLessThan(hourPass.includedActiveMinutes!);
  });
});

describe('§9 時間管理の設定', () => {
  it('heartbeat は idle 判定より短い（idleに達する前に必ず合図が来る）', () => {
    for (const p of SALES_PLAN_CATALOG) {
      expect(p.heartbeatSeconds, p.planId).toBeLessThan(p.idlePauseSeconds);
      expect(p.heartbeatSeconds, p.planId).toBeGreaterThan(0);
    }
  });
  it('時間制プランには残り時間の警告しきい値がある', () => {
    for (const p of SALES_PLAN_CATALOG.filter(isTimedPlan)) {
      expect(p.usageWarningThresholdMinutes, p.planId).toBeGreaterThan(0);
    }
  });
});

describe('§2 根拠のない煽り文句を入れない', () => {
  it('プラン文言に禁止語が無い', () => {
    for (const p of SALES_PLAN_CATALOG) {
      const text = [
        p.nameJa, p.nameZh, p.taglineJa, p.taglineZh,
        ...p.featuresJa, ...p.featuresZh, ...p.limitationsJa, ...p.limitationsZh,
        p.ctaLabelJa, p.ctaLabelZh, p.ctaLabelDisabledJa, p.ctaLabelDisabledZh,
      ].join('\n');
      for (const banned of BANNED_SALES_CLAIMS) {
        expect(text.includes(banned), `${p.planId} に禁止語「${banned}」`).toBe(false);
      }
    }
  });

  it('松竹梅という等級表現を学習者向け文言に出さない（§2「画面上では松竹梅とは表示しません」）', () => {
    // 1文字ずつ禁止すると中国語の「轻松（気軽に）」まで誤検出するので、
    // 等級として使われる形だけを禁じる。
    const GRADE_WORDS = ['松竹梅', '松プラン', '竹プラン', '梅プラン', '松コース', '竹コース', '梅コース',
                         '上位プラン', '中位プラン', '下位プラン', '松套餐', '竹套餐', '梅套餐'];
    for (const p of SALES_PLAN_CATALOG) {
      const text = [
        p.nameJa, p.nameZh, p.taglineJa, p.taglineZh,
        ...p.featuresJa, ...p.featuresZh, ...p.limitationsJa, ...p.limitationsZh,
      ].join('\n');
      for (const w of GRADE_WORDS) expect(text.includes(w), `${p.planId} に等級表現「${w}」`).toBe(false);
    }
  });

  it('人間レッスンの有無を、限定事項として必ず明示する（§6）', () => {
    for (const p of SALES_PLAN_CATALOG.filter((x) => x.humanLessonCount === 0)) {
      expect(p.limitationsJa.some((l) => l.includes('人間の先生')), p.planId).toBe(true);
      expect(p.limitationsZh.some((l) => l.includes('真人老师')), p.planId).toBe(true);
    }
  });

  it('自動更新なしを、限定事項として必ず明示する（§6）', () => {
    for (const p of SALES_PLAN_CATALOG.filter((x) => x.ctaMode === 'checkout')) {
      expect(p.limitationsJa.some((l) => l.includes('自動更新')), p.planId).toBe(true);
      expect(p.limitationsZh.some((l) => l.includes('自动续费')), p.planId).toBe(true);
    }
  });

  it('教材の全件閲覧を約束しない（§7「1万問すべて見られる」と書かない）', () => {
    const all = SALES_PLAN_CATALOG.flatMap((p) => [...p.featuresJa, ...p.featuresZh]).join('\n');
    expect(all.includes('すべて見')).toBe(false);
    expect(all.includes('全部见')).toBe(false);
    expect(all.includes('全部题目都能看')).toBe(false);
    // 「AIが選ぶ」という言い方になっていること
    expect(all.includes('AIが選び') || all.includes('AIが選')).toBe(true);
  });
});

describe('価格の単一情報源（§17 最重要 / §21 Hardcoded Prices）', () => {
  // planConfig.ts 以外に価格が書かれていないことを機械検査する。
  // これが崩れると「料金ページは600円、決済は900円」のような事故が起きる。
  //
  // 検査は2段階にしている。
  //   A) 販売系ディレクトリ … 生の数値リテラルまで禁止（ここは全部自分たちの管理下）
  //   B) src全体 …「600円」「600日元」のような**通貨つき表記**だけ禁止
  //      （読解教材に「1時間600円」のような本文が大量にあるため、
  //        生の数値まで禁じると教材が誤検出される。通貨つきでも教材本文には出るので、
  //        Bは教材ディレクトリを除外した上で見る）
  const SRC = join(process.cwd(), 'src');
  const SALES_DIR = join(SRC, 'lib', 'aiLesson', 'course', 'sales');
  const CANON = join(SALES_DIR, 'planConfig.ts');
  /** 教材データ。学習コンテンツの本文に金額が出るのは正常 */
  const CONTENT_DIRS = [
    join(SRC, 'lib', 'aiLesson', 'course', 'adventure'),
  ];

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else if (/\.(ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  };

  const isTest = (f: string) => /\.test\.tsx?$/.test(f);
  const isContent = (f: string) => CONTENT_DIRS.some((d) => f.startsWith(d));

  it('A: 販売系ディレクトリでは、価格の生数値が planConfig.ts にしか無い', () => {
    const prices = SALES_PLAN_CATALOG.map((p) => p.priceAmount);
    const offenders: string[] = [];
    const dirs = [SALES_DIR, join(SRC, 'pages', 'ai-lesson', 'plans')];

    for (const dir of dirs) {
      let files: string[];
      try { files = walk(dir); } catch { continue; }   // 未作成のディレクトリは飛ばす
      for (const file of files) {
        if (file === CANON || isTest(file)) continue;
        const body = readFileSync(file, 'utf8');
        for (const price of prices) {
          // Tailwindのクラス名（text-slate-600 等）に当たらないよう、
          // 英数字・ハイフン・ドットに続く数字は数値リテラルとみなさない
          const re = new RegExp(`(?<![\\w\\-.])${price}(?![\\w])`);
          if (re.test(body)) offenders.push(`${file.replace(SRC, 'src')}: ${price}`);
        }
      }
    }
    expect(offenders, `価格の生数値が planConfig.ts 以外にある:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('B: AIコース領域（教材を除く）に、通貨つきの価格表記が無い', () => {
    // バドミントン事業側（ActivityPage の参加費など）は別事業の金額なので対象外。
    // AIコースの販売文言・法務ページ・LPだけを見る。
    const AI_DIRS = [
      join(SRC, 'lib', 'aiLesson'),
      join(SRC, 'pages', 'ai-lesson'),
    ];
    const offenders: string[] = [];
    const patterns = SALES_PLAN_CATALOG.flatMap((p) => {
      const n = p.priceAmount.toLocaleString('en-US');
      const plain = String(p.priceAmount);
      return [`${n}円`, `${n}日元`, `${plain}円`, `${plain}日元`];
    });

    for (const dir of AI_DIRS) {
      for (const file of walk(dir)) {
        if (file === CANON || isTest(file) || isContent(file)) continue;
        const body = readFileSync(file, 'utf8');
        for (const pat of patterns) {
          if (body.includes(pat)) offenders.push(`${file.replace(SRC, 'src')}: ${pat}`);
        }
      }
    }
    expect(offenders, `通貨つき価格が planConfig.ts 以外にある:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('表示ヘルパー', () => {
  it('金額は ja/zh とも通貨が分かる形で出る', () => {
    expect(formatPlanPrice(hourPass, 'ja')).toBe('600円');
    expect(formatPlanPrice(hourPass, 'zh')).toBe('600日元');
    expect(formatPlanPrice(coach, 'ja')).toBe('100,000円');
  });

  it('税表記は taxIncluded に従う（税抜を税込と書かない）', () => {
    expect(formatTaxNote(hourPass, 'ja')).toBe('税込');
    expect(formatTaxNote({ ...hourPass, taxIncluded: false }, 'ja')).toBe('税抜');
    expect(formatTaxNote({ ...hourPass, taxIncluded: false }, 'zh')).toBe('不含税');
  });

  it('決済が使えないときは代替CTA文言に落ちる（§5）', () => {
    expect(ctaLabelFor(hourPass, 'ja', true)).toBe('600円で始める');
    expect(ctaLabelFor(hourPass, 'ja', false)).toBe('体験パスに申し込む');
    // 相談導線は決済の有無に影響されない
    expect(ctaLabelFor(coach, 'ja', false)).toBe('伴走コースについて相談する');
  });

  it('View は lang を解決して component 側の分岐を無くす', () => {
    const v = salesPlanView(month, 'zh', true);
    expect(v.name).toBe('1个月AI计划');
    expect(v.features).toEqual(month.featuresZh);
    expect(v.ctaLabel).toBe(month.ctaLabelZh);
    expect(v.acceptsPurchase).toBe(true);
  });
});

describe('公開状態の制御', () => {
  it('draft は学習者に出さないが、preview では見える', () => {
    // 実データを壊さずに分岐だけ確認する
    expect(isPlansPreview('?plans=preview')).toBe(true);
    expect(isPlansPreview('?plans=x')).toBe(false);
    expect(isPlansPreview('')).toBe(false);
    expect(plansForDisplay('?plans=preview').length).toBe(allSalesPlans().length);
    expect(plansForDisplay('').every((p) => p.status !== 'draft')).toBe(true);
  });

  it('paused は見えるが購入できない', () => {
    const paused: SalesPlanConfig = { ...hourPass, status: 'paused' };
    expect(acceptsPurchase(paused)).toBe(false);
    expect(acceptsPurchase(hourPass)).toBe(true);
  });

  it('購入可能なプランは published のみ', () => {
    expect(purchasableSalesPlans().every((p) => p.status === 'published')).toBe(true);
  });
});
