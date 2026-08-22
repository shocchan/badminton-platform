// @vitest-environment jsdom
// ふりがな（ルビ）の機械検査（2026-08-19 新設）。
//
// 守っていること:
// 1. 読解 N5/N4 全96セットの rubyJa が本文と完全一致（注釈を剥がすと passageJa になる）
//    ＝本文を直して注釈を直し忘れると必ずここで落ちる
// 2. 全漢字に読みが付いている（注釈の外に漢字が残らない）・読みはひらがなのみ
// 3. N2/N3 には rubyJa を付けない（本物の試験の問題用紙にもふりがなは無い）
// 4. かな全文（文法draftのfurigana）からの復元は「完全一致するときだけ」成功し、
//    失敗時は null（誤ったルビを組み立てない）。曖昧ケースの回帰テストを含む
// 5. 画面: showRuby のときだけ <rt> が出る。選択肢・設問には出ない。
//    読みが本文と食い違うデータは素の本文に落ちる（誤読を見せない）
// 6. 答え漏れ: 読みを問う問題（kanji-* / vocab-reading）のバトル画面に
//    <ruby>/<rt> が1つも出ない（実物の生成器＋実レンダリングで検査・2026-08-19 検品）
// 7. レイアウト: 本文コンテナの行間/折り返しクラスと ruby の内部構造・注釈runの長さ上限
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
afterEach(cleanup);
import { AdvRuby } from './AdvRuby';
import { parseRubyAnnotated, stripRuby, alignFurigana, hasKanji } from './advRubySegment';
import { AdvReadingRunner } from './AdvReadingRunner';
import { AdvBattleRunner } from './AdvBattleRunner';
import { readingSetsFor } from '../../../lib/aiLesson/course/adventure/reading/readingBank';
import { loadAllBasicDrafts } from '../../../lib/aiLesson/course/basicGrammarChunks';
import { kanjiPool } from '../../../lib/aiLesson/course/adventure/kanji/kanjiBank';
import { buildVocabQuestions, vocabScopedActive, VOCAB_POOL_SEED } from '../../../lib/aiLesson/course/adventure/vocab/vocabQuestions';
import type { AdvBattleQuestion } from '../../../lib/aiLesson/course/adventure/advVariants';

const KANJI = /[㐀-鿿豈-﫿々〆ヶ]/;
const HIRA_ONLY = /^[ぁ-ゖー]+$/;
const KANJI_ONLY = /^[㐀-鿿豈-﫿々〆ヶ]+$/;

describe('注釈のparse/strip', () => {
  it('`[表記|よみ]` を分解し、剥がすと元に戻る', () => {
    const annotated = '【ロッカーを[使|つか]う[方|かた]へ】\nかばん';
    expect(stripRuby(annotated)).toBe('【ロッカーを使う方へ】\nかばん');
    expect(parseRubyAnnotated(annotated)).toEqual([
      { text: '【ロッカーを' },
      { text: '使', reading: 'つか' },
      { text: 'う' },
      { text: '方', reading: 'かた' },
      { text: 'へ】\nかばん' },
    ]);
  });

  it('注釈が無い文はそのまま1segment', () => {
    expect(parseRubyAnnotated('ひらがなだけ。')).toEqual([{ text: 'ひらがなだけ。' }]);
  });
});

describe('読解 N5/N4: rubyJa の全件機械検査', () => {
  for (const level of ['N5', 'N4'] as const) {
    it(`${level}: 全セットに rubyJa があり、剥がすと本文と完全一致する`, () => {
      const sets = readingSetsFor(level);
      // 下限で守る（全件のルビ一致はこの下のループが見る）
      expect(sets.length).toBeGreaterThanOrEqual(48);
      for (const s of sets) {
        expect(s.rubyJa, `${s.setId}: rubyJa が無い`).toBeTruthy();
        expect(stripRuby(s.rubyJa!), `${s.setId}: 注釈を剥がした結果が本文と一致しない`).toBe(s.passageJa);
      }
    });

    it(`${level}: 全漢字に読みが付き、読みはひらがな・注釈baseは漢字のみ`, () => {
      for (const s of readingSetsFor(level)) {
        for (const seg of parseRubyAnnotated(s.rubyJa!)) {
          if (seg.reading === undefined) {
            expect(KANJI.test(seg.text), `${s.setId}: 読みの無い漢字が残っている: ${seg.text}`).toBe(false);
          } else {
            expect(HIRA_ONLY.test(seg.reading), `${s.setId}: 読みがひらがなでない: ${seg.text}|${seg.reading}`).toBe(true);
            expect(KANJI_ONLY.test(seg.text), `${s.setId}: 注釈のbaseに漢字以外が混ざっている: ${seg.text}`).toBe(true);
          }
        }
      }
    });
  }

  it('N2/N3 には rubyJa を付けない（本物の試験にもふりがなは無い）', () => {
    for (const level of ['N2', 'N3'] as const) {
      for (const s of readingSetsFor(level)) {
        expect(s.rubyJa, `${s.setId}: N5/N4以外にrubyJaが付いている`).toBeUndefined();
      }
    }
  });
});

describe('alignFurigana（かな全文→ルビ復元）', () => {
  it('基本形: 文節スペース区切りのかな全文から読みを復元する', () => {
    expect(alignFurigana('きょうは病院に行きます。', 'きょうは びょういんに いきます。')).toEqual([
      { text: 'きょうは' },
      { text: '病院', reading: 'びょういん' },
      { text: 'に' },
      { text: '行', reading: 'い' },
      { text: 'きます。' },
    ]);
  });

  it('回帰: 「国に帰りたい」を 国=くに／帰=かえ に割る（国=く／帰=にかえ にしない）', () => {
    const segs = alignFurigana('国に帰りたいです。', 'くにに かえりたいです。');
    expect(segs).not.toBeNull();
    expect(segs!.find((s) => s.text === '国')?.reading).toBe('くに');
    expect(segs!.find((s) => s.text === '帰')?.reading).toBe('かえ');
  });

  it('複合語の中に文節の切れ目が来ても復元できる（毎朝七時=まいあさ しちじ）', () => {
    const segs = alignFurigana('毎朝七時に家を出ます。', 'まいあさ しちじに いえを でます。');
    expect(segs).not.toBeNull();
    expect(segs!.find((s) => s.text === '毎朝七時')?.reading).toBe('まいあさしちじ');
  });

  it('カタカナ語はそのまま照合される（在留カード）', () => {
    const segs = alignFurigana('在留カードを持ってきてください。', 'ざいりゅうカードを もってきて ください。');
    expect(segs).not.toBeNull();
    expect(segs!.find((s) => s.text === '在留')?.reading).toBe('ざいりゅう');
  });

  it('かなアンカーが1文字でも食い違えば null（誤った組み立てをしない）', () => {
    expect(alignFurigana('薬を飲みます。', 'くすりを たべます。')).toBeNull();
    expect(alignFurigana('薬へ飲みます。', 'くすりを のみます。')).toBeNull();
  });

  it('本文側の算用数字など、かな側に無い文字があれば null', () => {
    expect(alignFurigana('りんごを3つ買いました。', 'りんごを みっつ かいました。')).toBeNull();
  });

  it('初級文法draft全件: 復元は「完全一致」だけ成功し、成功時は本文を完全再構成する', async () => {
    const drafts = await loadAllBasicDrafts();
    expect(drafts.length).toBeGreaterThan(100);
    let aligned = 0;
    for (const d of drafts) {
      const ex = d.examplesJa[0];
      if (!ex || !d.furigana) continue;
      const segs = alignFurigana(ex, d.furigana);
      if (segs === null) continue; // 復元不能は「出さない」だけ（画面はかな行の補助に落ちる）
      aligned++;
      expect(segs.map((s) => s.text).join(''), `${d.grammarId}: segment連結が例文と不一致`).toBe(ex);
      for (const s of segs) {
        if (s.reading !== undefined) {
          expect(HIRA_ONLY.test(s.reading), `${d.grammarId}: 読みがひらがなでない: ${s.text}|${s.reading}`).toBe(true);
          expect(hasKanji(s.text), `${d.grammarId}: 漢字でないsegmentに読みが付いた: ${s.text}`).toBe(true);
        }
      }
    }
    // 大半は復元できること（全滅していたら配線が壊れている）
    expect(aligned).toBeGreaterThanOrEqual(130);
  });
});

describe('AdvRuby コンポーネント', () => {
  it('show=true で <rt> に読みが出る・rtは支援技術から隠す', () => {
    const { container } = render(<AdvRuby text="使う方へ" ruby="[使|つか]う[方|かた]へ" show />);
    const rts = Array.from(container.querySelectorAll('rt'));
    expect(rts.map((r) => r.textContent)).toEqual(['つか', 'かた']);
    for (const rt of rts) expect(rt.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toContain('使');
  });

  it('show=false では素の本文だけ（rt無し）', () => {
    const { container } = render(<AdvRuby text="使う方へ" ruby="[使|つか]う[方|かた]へ" show={false} />);
    expect(container.querySelectorAll('rt').length).toBe(0);
    expect(container.textContent).toBe('使う方へ');
  });

  it('注釈が本文と食い違うときはルビを出さず素の本文に落ちる（誤読を見せない）', () => {
    const { container } = render(<AdvRuby text="使う方へ" ruby="[使|つか]う[人|ひと]へ" show />);
    expect(container.querySelectorAll('rt').length).toBe(0);
    expect(container.textContent).toBe('使う方へ');
  });

  it('kana（かな全文）からも描画でき、復元不能なら素の本文', () => {
    const ok = render(<AdvRuby text="病院に行きます。" kana="びょういんに いきます。" show />);
    expect(Array.from(ok.container.querySelectorAll('rt')).map((r) => r.textContent)).toEqual(['びょういん', 'い']);
    cleanup();
    // かなアンカー（漢字以外の部分）が食い違う＝復元不能。素の本文に落ちる
    const ng = render(<AdvRuby text="病院へ行きます。" kana="びょういんに いきます。" show />);
    expect(ng.container.querySelectorAll('rt').length).toBe(0);
    expect(ng.container.textContent).toBe('病院へ行きます。');
  });
});

describe('読解runner: ルビの出る場所・出ない場所', () => {
  it('showRuby=true: 本文に<rt>が出る。選択肢と設問には出ない', () => {
    const set = readingSetsFor('N5')[0];
    const { container } = render(
      <AdvReadingRunner lang="ja" sets={[set]} showRuby onFinish={() => {}} onClose={() => {}} />,
    );
    const passage = container.querySelector('p[lang="ja"]')!;
    expect(passage.querySelectorAll('rt').length).toBeGreaterThan(0);
    // ルビ込みでも本文テキストの並びが崩れていない（rtを除いた連結=本文）
    const withoutRt = Array.from(passage.childNodes)
      .map((n) => {
        if (n.nodeType === 3) return n.textContent ?? '';
        const el = n as Element;
        if (el.tagName === 'RUBY') {
          return Array.from(el.childNodes).filter((c) => (c as Element).tagName !== 'RT').map((c) => c.textContent ?? '').join('');
        }
        return el.textContent ?? '';
      })
      .join('');
    expect(withoutRt).toBe(set.passageJa);
    // 選択肢（button）にはルビを出さない（語彙の表記問題と同じ事故を避ける）
    for (const btn of Array.from(container.querySelectorAll('button'))) {
      expect(btn.querySelectorAll('rt').length, '選択肢にルビが出ている').toBe(0);
    }
  });

  it('showRuby未指定（N3以上）: <rt>は一切出ない', () => {
    const set = readingSetsFor('N5')[0];
    const { container } = render(
      <AdvReadingRunner lang="ja" sets={[set]} onFinish={() => {}} onClose={() => {}} />,
    );
    expect(container.querySelectorAll('rt').length).toBe(0);
    expect(container.querySelector('p[lang="ja"]')!.textContent).toBe(set.passageJa);
  });
});

/**
 * 答え漏れの実レンダリング検査（2026-08-19 検品で追加）。
 * 「漢字の読みを問う問題にふりがなが付いたら即・答え漏れ」なので、
 * 読みを問う問題タイプ（kanji-onyomi / kanji-kunyomi / kanji-wordreading / vocab-reading）を
 * 実物の生成器から作り、バトル画面に <ruby>/<rt> が1つも出ないことをDOMで確かめる。
 * （AdvRuby を配線しない、という設計上の約束を「配線されていない」実測で固定する）
 */
describe('答え漏れ: 読みを問う問題の画面にルビが出ない', () => {
  const renderBattle = (pool: Map<string, AdvBattleQuestion[]>, targetId: string) => render(
    <AdvBattleRunner
      lang="ja" tier="normal" targetId={targetId} targetLabel="検査対象" targetIds={[targetId]}
      pool={pool} seenKeys={new Set()} recentWrongKeys={new Set()} priorAttempts={[]}
      dateKey="2026-08-19" nowISO="2026-08-19T10:00:00.000Z" level="N3"
      onFinish={vi.fn()} onClose={vi.fn()} />,
  );

  it('kanji-*（実物の漢字バンク問題）: 設問にも選択肢にも <ruby>/<rt> が無い', () => {
    const pool = kanjiPool('N5');
    const targetId = [...pool.keys()][0];
    expect(pool.get(targetId)!.length).toBeGreaterThan(0);
    for (const q of pool.get(targetId)!) expect(q.type.startsWith('kanji-')).toBe(true);
    const { container } = renderBattle(pool, targetId);
    // 問題は実際に表示されている（空画面で素通りしない）
    expect(container.querySelectorAll('button').length).toBeGreaterThanOrEqual(4);
    expect(container.querySelectorAll('ruby, rt').length).toBe(0);
  });

  it('vocab-reading（実物の語彙読み問題）: 設問にも選択肢にも <ruby>/<rt> が無い', () => {
    // 実生成器から「読み方はどれですか」問題だけを集める
    const active = vocabScopedActive('N3');
    const readingQs: AdvBattleQuestion[] = [];
    for (let i = 0; i < active.length && readingQs.length < 8; i++) {
      const qs = buildVocabQuestions(active[i], active, VOCAB_POOL_SEED + i * 31)
        .filter((q) => q.type === 'vocab-reading');
      readingQs.push(...qs);
    }
    expect(readingQs.length).toBeGreaterThan(0);
    const pool = new Map<string, AdvBattleQuestion[]>([['vocab-read-check', readingQs]]);
    const { container } = renderBattle(pool, 'vocab-read-check');
    expect(container.querySelectorAll('button').length).toBeGreaterThanOrEqual(4);
    expect(container.querySelectorAll('ruby, rt').length).toBe(0);
  });
});

/**
 * ルビ表示のレイアウト構造（行間・折り返しの前提）。
 * jsdomは実寸を計算しないので、レイアウトを決める構造・クラスを固定する:
 * - 本文コンテナに leading-8（rtのぶんの行間余白）と whitespace-pre-wrap（\nでの折り返し）
 * - <ruby> はインライン要素だけで組まれ、中身は「表記 + rt1個」（rtはaria-hidden）
 * - 注釈の1runが短い（長い1boxは行内で折り返せず、モバイルではみ出すため）
 */
describe('ルビのレイアウト構造', () => {
  it('本文コンテナが leading-8 / whitespace-pre-wrap を持ち、ruby構造が正しい', () => {
    const set = readingSetsFor('N5').find((s) => s.rubyJa!.includes('\n'))!;
    const { container } = render(
      <AdvReadingRunner lang="ja" sets={[set]} showRuby onFinish={() => {}} onClose={() => {}} />,
    );
    const passage = container.querySelector('p[lang="ja"]')!;
    expect(passage.className).toContain('whitespace-pre-wrap');
    expect(passage.className).toContain('leading-8');
    const rubies = Array.from(passage.querySelectorAll('ruby'));
    expect(rubies.length).toBeGreaterThan(0);
    for (const r of rubies) {
      // 中身は「表記テキスト + rt1個」だけ（rb/rp等の互換タグや入れ子を作らない）
      const rts = r.querySelectorAll('rt');
      expect(rts.length).toBe(1);
      expect(rts[0].getAttribute('aria-hidden')).toBe('true');
      // rtの縮小クラス（無いと行間が読みの高さぶん暴れる）
      expect(r.className).toContain('[&>rt]:text-[0.6em]');
      // ブロック要素を含まない（行内で折り返せる）
      expect(r.querySelector('div, p')).toBeNull();
    }
    // 改行は本文テキストとして保持される（whitespace-pre-wrap が効く前提）
    expect(passage.textContent).toContain('\n');
  });

  it('全96セット: 注釈1runの長さが折り返し可能な範囲（表記6字・読み12字以内）', () => {
    for (const level of ['N5', 'N4'] as const) {
      for (const s of readingSetsFor(level)) {
        for (const seg of parseRubyAnnotated(s.rubyJa!)) {
          if (seg.reading === undefined) continue;
          expect([...seg.text].length, `${s.setId}: 表記runが長すぎる: ${seg.text}`).toBeLessThanOrEqual(6);
          expect([...seg.reading].length, `${s.setId}: 読みが長すぎる: ${seg.reading}`).toBeLessThanOrEqual(12);
        }
      }
    }
  });
});
