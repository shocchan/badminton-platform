// public/llms.txt が実態とズレていないか（2026-08-24）。
//
// 【なぜ要るか】
// llms.txt は ChatGPT・Claude・Perplexity 等がサイトを要約・引用するときの材料になる。
// つまり**ここに書いた数字が、AIの口から利用者へ伝わる**。
// 価格やプラン名を planCatalog で変えたのに llms.txt を直し忘れると、
// AIが古い値段を答え続ける。サイト上の表示より直しにくい嘘になるので、機械で縛る。
//
// 落ちたら public/llms.txt を実態に合わせること。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { publishedPlans } from '../aiLesson/course/plans/planCatalog';

const ROOT = join(__dirname, '../../..');
const llms = readFileSync(join(ROOT, 'public/llms.txt'), 'utf8');
const robots = readFileSync(join(ROOT, 'public/robots.txt'), 'utf8');

describe('llms.txt: 商品情報が planCatalog と一致する', () => {
  it('前提: 公開プランがある', () => {
    expect(publishedPlans().length).toBeGreaterThan(0);
  });

  for (const p of publishedPlans()) {
    it(`「${p.nameJa}」の名前と価格が載っている`, () => {
      expect(llms, `プラン名「${p.nameJa}」が llms.txt に無い`).toContain(p.nameJa);
      expect(llms, `「${p.nameJa}」の価格 ${p.priceLabelJa} が llms.txt と食い違う`)
        .toContain(p.priceLabelJa);
    });
  }

  it('公開していないプランを載せていない（未確定の商品をAIに広めない）', () => {
    const publishedNames = new Set(publishedPlans().map((p) => p.nameJa));
    // draft/planned のプラン名が llms.txt に出ていたら、まだ売っていないものを宣伝している
    for (const name of ['3か月', '年間パス']) {
      if (!publishedNames.has(name)) {
        expect(llms).not.toContain(`${name} プラン`);
      }
    }
  });
});

describe('llms.txt: 言い過ぎない', () => {
  it('合格保証・上達保証をしていない', () => {
    for (const ng of ['合格を保証', '必ず合格', '上達を保証', '確実に話せる']) {
      expect(llms, `llms.txt に過大な約束「${ng}」がある`).not.toContain(ng);
    }
  });

  it('保証しない旨を明示している（AIが盛って要約するのを抑える）', () => {
    expect(llms).toContain('保証するものではありません');
  });
});

describe('llms.txt: 参照先が実在する', () => {
  it('主要ページのURLを挙げている', () => {
    for (const path of [
      '/ja/', '/ja/activity', '/ja/level-guide', '/ja/venues', '/ja/faq',
      '/ja/ai-course', '/zh/ai-course', '/ja/ai-course/tokushoho',
    ]) {
      expect(llms, `${path} が llms.txt に無い`).toContain(`https://kawabado.com${path}`);
    }
  });

  it('非公開URLを案内していない', () => {
    for (const priv of ['/ja/admin', '/ja/mypage', '/internal', '/guide/']) {
      expect(llms, `非公開の ${priv} を llms.txt に載せている`).not.toContain(priv);
    }
  });
});

describe('robots.txt: AIクローラーを明示的に許可している', () => {
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'OAI-SearchBot']) {
    it(`${bot} を明示している`, () => {
      expect(robots, `${bot} の記述が無い`).toContain(bot);
    });
  }

  it('AIクローラー向けにも管理画面を塞いでいる（* の Disallow は継承されない）', () => {
    // GPTBot ブロック以降にも Disallow が並んでいること
    const idx = robots.indexOf('GPTBot');
    expect(idx).toBeGreaterThan(-1);
    const after = robots.slice(idx);
    for (const rule of ['/ja/admin', '/ja/mypage', '/internal/', '/guide/']) {
      expect(after, `AIクローラー向けブロックに ${rule} が無い`).toContain(`Disallow: ${rule}`);
    }
  });

  it('llms.txt 自体は塞いでいない', () => {
    expect(robots).not.toContain('Disallow: /llms.txt');
  });
});
