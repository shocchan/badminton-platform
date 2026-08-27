// 受講者の声の扱い（2026-08-27）。
//
// 実際にもらった感想を載せた。ここで守るのは2つ。
//
// ① **都合の悪い声を消さない。**
//    「時々、不具合が出たりもするけど」という指摘が入っている。
//    これが載っているから他の3つが信じられる。消した瞬間、全部が広告文になる。
//    直したくなったら、文を削るのではなく不具合そのものを直すこと。
//
// ② **使い心地と成果を混ぜない。**
//    もらった声はどれも「使いやすい・続けやすい」の話で、
//    「N2に受かった」のような成果ではない。成果は確認できるまで書かない。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LP } from './lpContent';

const ja = LP.testimonials.entries.ja;
const zh = LP.testimonials.entries.zh;

describe('載せている声', () => {
  it('ja / zh が同じ件数（片方だけ増やすと訳が抜ける）', () => {
    expect(ja.length).toBe(zh.length);
    expect(ja.length).toBeGreaterThanOrEqual(4);
  });

  it('欠点を書いた声が残っている', () => {
    // ここが落ちたら、都合の悪い声を消したということ
    expect(ja.some((e) => e.text.includes('不具合')), '不具合に触れた声が消えている').toBe(true);
    expect(zh.some((e) => e.text.includes('小问题')), '中国語版から欠点の指摘が消えている').toBe(true);
  });

  it('欠点の声は「でも直った」で終わっていて、言いっぱなしにしていない', () => {
    const jaFlaw = ja.find((e) => e.text.includes('不具合'))!;
    expect(jaFlaw.text).toContain('改善');
  });

  it('placeholder（まだ声がありません、の告知）が残っていない', () => {
    const all = ja.map((e) => e.text).join('');
    expect(all).not.toContain('先行モニター');
    expect(all).not.toContain('今後、事実にもとづいて');
  });
});

describe('成果を語らせない', () => {
  const all = [...ja, ...zh].map((e) => e.text).join('\n');

  it('試験の合否や点数を書いていない', () => {
    // 「点」1文字では「目標地点」「这点很好」「点屏幕」に当たるので、主張の形で見る
    for (const ng of ['合格', '受かっ', '点数', 'N1', 'N2', '及格', '考过', '分数']) {
      expect(all, `成果の主張「${ng}」は確認できるまで書かない`).not.toContain(ng);
    }
  });

  it('「話せるようになった」という上達の断定をしていない', () => {
    for (const ng of ['話せるようになりました', 'ペラペラ', '流暢に', '会说了']) {
      expect(all).not.toContain(ng);
    }
  });

  it('leadが「使い心地であって成果ではない」と言っている', () => {
    expect(LP.testimonials.lead.ja).toContain('使い心地');
    expect(LP.testimonials.lead.ja).toContain('成果は確認できてから');
  });

  it('中国語版が訳であることを伝えている（原文のふりをしない）', () => {
    expect(LP.testimonials.lead.zh).toContain('翻译');
  });
});

describe('声が言っている機能が実在する', () => {
  it('挙がっている機能名がコードにある（存在しない機能を褒めさせない）', () => {
    const used = ja.map((e) => e.used ?? '').join(' ');
    expect(used).toContain('冒険マップ');
    expect(used).toContain('報告機能');
    // 声が触れている機能が実在すること。無い機能を褒める声は載せられない
    for (const f of [
      'src/components/ai-course/adventure/AdvWorldMap.tsx',      // 冒険マップ
      'src/components/ai-course/ops/SupportReportButton.tsx',    // 不具合の報告
    ]) {
      expect(() => readFileSync(f, 'utf8'), `${f} が無いのに声で触れている`).not.toThrow();
    }
  });
});

describe('クローラーからも読める', () => {
  const doc = JSON.parse(readFileSync('src/lib/seo/lpPrerender.json', 'utf8')) as {
    ja: { blocks: { h?: string; p?: string[] }[] };
    zh: { blocks: { h?: string; p?: string[] }[] };
  };
  const flat = (lang: 'ja' | 'zh') =>
    doc[lang].blocks.map((b) => [b.h ?? '', ...(b.p ?? [])].join('\n')).join('\n');

  it.each(['ja', 'zh'] as const)('%s: 4件とも本文に入っている', (lang) => {
    const text = flat(lang);
    for (const e of LP.testimonials.entries[lang]) expect(text).toContain(e.text);
  });

  it('欠点の声もクローラー向け本文に入っている（表向きだけ良く見せない）', () => {
    expect(flat('ja')).toContain('不具合');
  });
});
