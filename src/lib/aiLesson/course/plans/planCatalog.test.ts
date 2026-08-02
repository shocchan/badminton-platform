// 商品カタログの受入テスト。
//
// いちばん守りたいのは **「価格をここ以外に書かない」**。
// componentへ直接書くと、カタログを直したのに一部の画面だけ古い、という食い違いが起きる。
// 食い違ったまま公開すると、表示と請求が違うという最悪の事故になるので、機械で検出する。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  PLAN_CATALOG, publishedPlans, visiblePlans, allPlans, planById,
  acceptsApplication, isPlanPreview, planView, PROVISIONAL_TERMS_NOTICE,
} from './planCatalog';

describe('カタログの形', () => {
  it('idが重複していない', () => {
    const ids = PLAN_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sortOrderが重複していない（並び順が不定にならない）', () => {
    const orders = PLAN_CATALOG.map((p) => p.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('ja/zh が両方そろっている（片方だけの商品を作らない）', () => {
    for (const p of PLAN_CATALOG) {
      for (const k of ['name', 'priceLabel', 'description', 'durationLabel'] as const) {
        expect(p[`${k}Ja`].length, `${p.id}.${k}Ja`).toBeGreaterThan(0);
        expect(p[`${k}Zh`].length, `${p.id}.${k}Zh`).toBeGreaterThan(0);
      }
      expect(p.featuresJa.length, `${p.id}.featuresJa`).toBeGreaterThan(0);
      expect(p.featuresZh.length, `${p.id}.featuresZh`).toBe(p.featuresJa.length);
      // 月額換算は任意。片方だけ書くのは不可
      expect(!!p.monthlyEquivalentJa, `${p.id}.monthlyEquivalent`).toBe(!!p.monthlyEquivalentZh);
    }
  });

  it('公開中の商品は価格が「準備中」のままではない', () => {
    for (const p of publishedPlans()) {
      expect(p.priceLabelJa, p.id).not.toMatch(/準備中/);
      expect(p.priceLabelZh, p.id).not.toMatch(/准备中/);
    }
  });

  it('人によるレッスンが無い商品は lessonCount が0', () => {
    const trial = planById('ai-trial-pass')!;
    const month = planById('ai-month')!;
    expect(trial.lessonCount).toBe(0);
    expect(month.lessonCount).toBe(0);
    expect(planById('coach-6m')!.lessonCount).toBe(24);
  });

  it('累計上限がある商品は aiMinutes を持つ', () => {
    expect(planById('ai-trial-pass')!.aiMinutes).toBe(60);
  });
});

describe('公開状態', () => {
  it('publishedPlans は published だけ・sortOrder順', () => {
    const p = publishedPlans();
    expect(p.every((x) => x.status === 'published')).toBe(true);
    expect(p.map((x) => x.sortOrder)).toEqual([...p.map((x) => x.sortOrder)].sort((a, b) => a - b));
  });

  it('visiblePlans は draft を含まない', () => {
    expect(visiblePlans().some((x) => x.status === 'draft')).toBe(false);
  });

  it('allPlans は draft も含む（CEOのプレビュー用）', () => {
    expect(allPlans().length).toBe(PLAN_CATALOG.length);
    expect(allPlans().some((x) => x.status === 'draft')).toBe(true);
  });

  it('**draft と paused は申込を受けない**', () => {
    for (const p of PLAN_CATALOG) {
      if (p.status !== 'published') expect(acceptsApplication(p), p.id).toBe(false);
    }
  });

  it('checkout は申込を受けない（production Stripeを有効化していない）', () => {
    const fake = { ...planById('coach-6m')!, ctaMode: 'checkout' as const };
    expect(acceptsApplication(fake)).toBe(false);
  });

  it('**production checkout を使っている商品が無い**', () => {
    for (const p of PLAN_CATALOG) expect(p.ctaMode, p.id).not.toBe('checkout');
  });

  it('?plans=preview のときだけ draft を出す', () => {
    expect(isPlanPreview('?plans=preview')).toBe(true);
    expect(isPlanPreview('?plans=1')).toBe(false);
    expect(isPlanPreview('')).toBe(false);
  });
});

describe('表示用ビュー', () => {
  it('言語で中身が切り替わる', () => {
    const p = planById('coach-6m')!;
    expect(planView(p, 'ja').name).toBe(p.nameJa);
    expect(planView(p, 'zh').name).toBe(p.nameZh);
    expect(planView(p, 'zh').features).toEqual(p.featuresZh);
  });

  it('月額換算が無い商品は null（空文字を出さない）', () => {
    expect(planView(planById('ai-trial-pass')!, 'ja').monthlyEquivalent).toBeNull();
    expect(planView(planById('coach-6m')!, 'ja').monthlyEquivalent).toMatch(/月額換算/);
  });

  it('**キャンセル・返金は断定しない暫定表示**（法的確認が終わるまで）', () => {
    for (const p of PLAN_CATALOG) {
      for (const lang of ['ja', 'zh'] as const) {
        const notice = planView(p, lang).termsNotice;
        expect(notice).toBe(PROVISIONAL_TERMS_NOTICE[lang]);
      }
    }
    // 6か月コースについて「返金不可」「8日経過後は返金なし」と断定していない
    expect(PROVISIONAL_TERMS_NOTICE.ja).not.toMatch(/返金はいたしません|返金不可|8日/);
    expect(PROVISIONAL_TERMS_NOTICE.zh).not.toMatch(/不予退款|不可退款|8天/);
    // 「プランと契約条件による」と言っている
    expect(PROVISIONAL_TERMS_NOTICE.ja).toMatch(/プラン/);
    expect(PROVISIONAL_TERMS_NOTICE.ja).toMatch(/契約条件/);
  });
});

/* ────────────────────────────────────────────────────────────
   価格のハードコード検出
   ──────────────────────────────────────────────────────────── */

const SRC = join(__dirname, '../../../..');

/**
 * 商品価格を書いてよい場所。
 *
 * 2026-08-02 更新: セルフサービス販売（決済・利用権・採算集計）が入り、
 * **数値としての価格が必要になった**ため、金額の正準は
 * `lib/aiLesson/course/sales/planConfig.ts` へ移した。
 * このファイル（planCatalog）は表示ラベルを `priceLabelFromSales()` で導出するだけで、
 * 独自の金額を持たない。
 */
const ALLOWED = [
  'lib/aiLesson/course/sales/planConfig.ts',
  'lib/aiLesson/course/sales/planConfig.test.ts',
  'lib/aiLesson/course/plans/planCatalog.ts',
  'lib/aiLesson/course/plans/planCatalog.test.ts',
  // 料金ページのテストは、正準の金額が画面に出ていることを確かめるために金額を書く
  'pages/ai-lesson/plans/plansPage.test.tsx',
];

/**
 * 教材・イベント運営の金額は商品価格ではないので除く。
 * - 読解／聴解の問題文には料金表が普通に出てくる
 * - バドミントン側（参加費600円など）はAIコースの商品ではない
 */
const SKIP_DIRS = [
  'lib/aiLesson/course/adventure/reading',
  'lib/aiLesson/course/adventure/listening',
  'lib/aiLesson/course/adventure/vocab',
];
const SKIP_FILES = ['pages/AdminPage.tsx', 'pages/ActivityPage.tsx', 'lib/fee.ts'];

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
};

describe('価格のハードコード', () => {
  it('**商品価格が planCatalog の外に書かれていない**', () => {
    // 6桁以上（100,000）と、カタログにある金額表記を探す
    const patterns = [/100,000\s*(円|日元)/, /16,700\s*(円|日元)/, /\b100000\b/];
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = file.slice(SRC.length + 1).replace(/\\/g, '/');
      if (ALLOWED.includes(rel)) continue;
      if (SKIP_DIRS.some((d) => rel.startsWith(d))) continue;
      if (SKIP_FILES.includes(rel)) continue;
      const text = readFileSync(file, 'utf8');
      for (const p of patterns) {
        const m = text.match(p);
        if (m) offenders.push(`${rel}: ${m[0]}`);
      }
    }
    expect(
      offenders,
      `商品価格は sales/planConfig.ts が正準です。見つかった場所:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────
   version の上げ忘れ検出
   ──────────────────────────────────────────────────────────── */

/** 申込記録に残る内容（＝あとから再現したい情報）だけをハッシュにする */
const planHash = (id: string): string => {
  const p = planById(id)!;
  const material = JSON.stringify([
    p.nameJa, p.nameZh, p.priceLabelJa, p.priceLabelZh,
    p.monthlyEquivalentJa ?? '', p.monthlyEquivalentZh ?? '',
    p.descriptionJa, p.descriptionZh, p.durationLabelJa, p.durationLabelZh,
    p.aiMinutes, p.lessonCount, p.featuresJa, p.featuresZh,
  ]);
  return createHash('sha256').update(material).digest('hex').slice(0, 12);
};

/**
 * 版と内容の対応表。**内容を変えたら version を上げ、ここのハッシュも更新する。**
 * 申込記録には planVersion しか残らないので、版を据え置くと
 * 「この人が見た内容」を後から特定できなくなる。
 *
 * 例外は「まだ一度も公開していない版」。誰の申込にも紐づいていないので、
 * 版を据え置いてハッシュだけ直してよい（version 1 が初回公開ぶん）。
 * **一度でも公開したら、以後は必ず version を上げること。**
 */
const PLAN_FINGERPRINTS: Record<string, { version: number; hash: string }> = {
  'ai-trial-pass': { version: 1, hash: '50e5c60bb64e' },
  // 2026-08-02: 価格ラベルを sales/planConfig.ts からの導出に変えた結果、
  // 「準備中」→ 正準カタログの金額 に変わった。version 1 はまだ一度も
  // 申込に紐づいていない初回公開ぶんなので、上の例外どおりハッシュだけ更新する。
  'ai-month': { version: 1, hash: '0cc7f8c3805f' },
  'coach-6m': { version: 1, hash: 'c5b5d10ece0d' },
};

describe('プランの版', () => {
  it('カタログの全プランが対応表に載っている', () => {
    for (const p of PLAN_CATALOG) expect(PLAN_FINGERPRINTS[p.id], p.id).toBeDefined();
  });

  it('**内容を変えたら version を上げる**（据え置きを検出する）', () => {
    // 1件目で止めず全部集める。1回のテスト実行で全プランの新しいハッシュが分かるように
    const actual = PLAN_CATALOG.map((p) => `${p.id} = { version: ${p.version}, hash: '${planHash(p.id)}' }`);
    const recorded = PLAN_CATALOG.map((p) => {
      const fp = PLAN_FINGERPRINTS[p.id];
      return `${p.id} = { version: ${fp.version}, hash: '${fp.hash}' }`;
    });
    expect(
      recorded,
      [
        '',
        'プランの内容が変わっています。',
        '申込記録には planVersion しか残らないので、版を据え置くと',
        '「この人が見た内容」を後から特定できなくなります。',
        '',
        '対応:',
        '  1. planCatalog.ts の該当プランの version を上げる',
        '  2. このテストの PLAN_FINGERPRINTS を下の Received の値に合わせる',
        '',
      ].join('\n'),
    ).toEqual(actual);
  });
});
