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
      for (const k of ['name', 'priceLabel', 'description', 'durationLabel', 'audience', 'ctaLabel'] as const) {
        expect(p[`${k}Ja`].length, `${p.id}.${k}Ja`).toBeGreaterThan(0);
        expect(p[`${k}Zh`].length, `${p.id}.${k}Zh`).toBeGreaterThan(0);
      }
      expect(p.featuresJa.length, `${p.id}.featuresJa`).toBeGreaterThan(0);
      expect(p.featuresZh.length, `${p.id}.featuresZh`).toBe(p.featuresJa.length);
      expect(p.notIncludedZh.length, `${p.id}.notIncludedZh`).toBe(p.notIncludedJa.length);
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

  it('**人レッスンの無い商品は「含まれないもの」を明示する**（誤解防止）', () => {
    for (const p of PLAN_CATALOG.filter((x) => x.lessonCount === 0)) {
      expect(p.notIncludedJa.length, p.id).toBeGreaterThan(0);
      expect(p.notIncludedJa.join(''), p.id).toContain('個別レッスン');
      expect(p.notIncludedJa.join(''), p.id).toContain('個別ロードマップ');
      expect(p.notIncludedJa.join(''), p.id).toContain('WeChat');
    }
  });

  it('**体験パスはリアルタイム60分制**（CEO決定 2026-08-20。累計制は廃止）', () => {
    expect(planById('ai-trial-pass')!.realtimeWindowMinutes).toBe(60);
    expect(planById('ai-trial-pass')!.aiMinutes).toBeNull();
    expect(planById('ai-month')!.realtimeWindowMinutes).toBeNull();
    expect(planById('coach-6m')!.realtimeWindowMinutes).toBeNull();
    // 文言もカタログの数字と食い違わないこと
    expect(planById('ai-trial-pass')!.durationLabelJa).toContain('開始から60分');
  });

  it('買い切りプラン（60分・1か月）は購入日から30日間', () => {
    expect(planById('ai-trial-pass')!.accessDays).toBe(30);
    expect(planById('ai-month')!.accessDays).toBe(30);
    // 6か月コースは開始日を人が決める（日数固定にしない）
    expect(planById('coach-6m')!.accessDays).toBeNull();
  });

  it('**体験パスだけ地域上限3**（CEO決定 2026-08-19: 60分＋最初の3地域まで）', () => {
    expect(planById('ai-trial-pass')!.contentRegionLimit).toBe(3);
    expect(planById('ai-month')!.contentRegionLimit).toBeNull();
    expect(planById('coach-6m')!.contentRegionLimit).toBeNull();
    // 文言もカタログの数字と食い違わないこと
    expect(planById('ai-trial-pass')!.featuresJa.join('')).toContain('3地域');
  });

  it('**全プランで自動更新なし**（買い切り）', () => {
    for (const p of PLAN_CATALOG) expect(p.autoRenew, p.id).toBe(false);
  });

  it('価格の数値（priceJpy）とラベルが食い違っていない', () => {
    expect(planById('ai-trial-pass')!.priceJpy).toBe(600);
    expect(planById('ai-month')!.priceJpy).toBe(2980);
    expect(planById('coach-6m')!.priceJpy).toBe(100000);
    for (const p of PLAN_CATALOG) {
      if (p.priceJpy === null) continue;
      // ラベル中の数字（カンマ・万表記を展開）と数値が一致すること
      const label = p.priceLabelJa.replace(/,/g, '').replace(/(\d+)万/, (_, n) => String(Number(n) * 10000));
      expect(label, `${p.id}: ${p.priceLabelJa}`).toContain(String(p.priceJpy));
    }
  });

  it('6か月コースが recommended（料金表で最も目立たせる）', () => {
    expect(planById('coach-6m')!.recommended).toBe(true);
    expect(PLAN_CATALOG.filter((p) => p.recommended).length).toBe(1);
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

  it('allPlans は状態を問わず全部返す（CEOのプレビュー用）', () => {
    expect(allPlans().length).toBe(PLAN_CATALOG.length);
  });

  it('3プランとも公開中（2026-08-19 3段階化）', () => {
    expect(publishedPlans().map((p) => p.id)).toEqual(['ai-trial-pass', 'ai-month', 'coach-6m']);
  });

  it('**draft と paused は申込を受けない**', () => {
    for (const p of PLAN_CATALOG) {
      if (p.status !== 'published') expect(acceptsApplication(p), p.id).toBe(false);
    }
  });

  it('checkout の商品も申込フォームは受けられる（決済無効時のフォールバック）', () => {
    expect(acceptsApplication(planById('ai-trial-pass')!)).toBe(true);
    expect(acceptsApplication(planById('ai-month')!)).toBe(true);
  });

  it('**人間レッスンを含む商品に checkout を設定しない**（10万円の無人決済を作らない）', () => {
    for (const p of PLAN_CATALOG) {
      if (p.lessonCount > 0) expect(p.ctaMode, p.id).not.toBe('checkout');
    }
    expect(planById('coach-6m')!.ctaMode).toBe('consult');
  });

  it('セルフサービス2商品はオンライン決済（checkout）', () => {
    expect(planById('ai-trial-pass')!.ctaMode).toBe('checkout');
    expect(planById('ai-month')!.ctaMode).toBe('checkout');
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

/** 商品価格を書いてよいのはここだけ */
const ALLOWED = [
  'lib/aiLesson/course/plans/planCatalog.ts',
  'lib/aiLesson/course/plans/planCatalog.test.ts',
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
  // 帰化面接の回答例に出てくる生活費（「毎月約10万円」）は商品価格ではない
  'lib/aiLesson/course/adventure/interview',
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
    // カタログにある金額表記（新旧両方）を探す
    const patterns = [/100,000\s*(円|日元)/, /10万\s*(円|日元)/, /16,700\s*(円|日元)/, /\b100000\b/];
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
      `商品価格は planCatalog.ts が正準です。見つかった場所:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────
   Edge Function 用カタログの drift 検出
   ──────────────────────────────────────────────────────────── */

describe('Edge Function 用カタログ（決済の金額ソース）', () => {
  it('**supabase/functions/_shared/aiCoursePlans.ts がカタログと同期している**', async () => {
    // 決済金額はEdge Functionが自分のカタログ（生成物）から読む。ここがズレると
    // 「LPの表示と請求額が違う」事故になるので、生成し忘れをテストで止める
    const { buildFunctionPlanCatalogSource } = await import('../../../../../scripts/ai-course/functionPlanCatalog');
    const generated = readFileSync(
      join(SRC, '../supabase/functions/_shared/aiCoursePlans.ts'), 'utf8');
    expect(
      generated,
      'カタログ変更後に npm run generate:ai-course-function-catalog を実行してください',
    ).toBe(buildFunctionPlanCatalogSource());
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
    // 2026-08-19: 申込者が見る内容が増えたぶんを版の対象へ追加
    p.accessDays, p.autoRenew, p.notIncludedJa, p.notIncludedZh,
    p.audienceJa, p.audienceZh, p.ctaLabelJa, p.ctaLabelZh,
    p.contentRegionLimit, p.realtimeWindowMinutes,
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
  // 2026-08-19 3段階化＋地域上限 → 08-20 体験パスをリアルタイム60分制へ（trial v3）:
  // trial v3=開始から実時間60分・month v2=全地域文言・coach v4=対象者/含まれないもの/CTA追加（価格不変）
  'ai-trial-pass': { version: 3, hash: '9ffcc2a354bb' },
  'ai-month': { version: 2, hash: 'cf74e712d0c9' },
  'coach-6m': { version: 4, hash: 'a3242b26b987' },
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
