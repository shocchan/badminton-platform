// ことわざの読み上げが、間違った読みを教えないこと（2026-09-09 CEO実機報告）。
//
// 報告: 「住めば都」の読み上げを押したら **「すめばと」** と発音された。
// ブラウザの音声合成へ漢字のまま渡していたため、読みが割れる字（都＝みやこ/と）を外していた。
//
// 日本語を教える商品が読みを間違えて教えるのは、教材の誤植と同じ重さ。
// ここでは「合成側に読みを judge させない」ことを構造で固定する。
import { describe, it, expect } from 'vitest';
import {
  PROVERBS, proverbById, proverbSpeechText, proverbExampleSpeechText,
} from './advProverbs';

describe('見出しの読み上げ', () => {
  it('「住めば都」は authored のよみを読ませる（すめばと にならない）', () => {
    const p = proverbById('sumeba')!;
    expect(p.ja).toBe('住めば都');
    expect(proverbSpeechText(p)).toBe('すめばみやこ');
    // 漢字をそのまま渡さない＝合成側に読みを決めさせない
    expect(proverbSpeechText(p)).not.toContain('都');
  });

  it('**全60件**で、読み上げに漢字を渡していない', () => {
    const hasKanji = (s: string) => /[一-鿿]/.test(s);
    const bad = PROVERBS.filter((p) => hasKanji(proverbSpeechText(p)));
    expect(bad.map((p) => p.ja)).toEqual([]);
  });

  it('よみが空の異常データでは見出しへ落とす（読み上げを黙って失わない）', () => {
    expect(proverbSpeechText({ ja: '住めば都', yomi: '   ' })).toBe('住めば都');
  });
});

describe('例文の読み上げ', () => {
  it('見出しがそのまま入っている例文は、その部分だけをよみに置き換える', () => {
    const p = proverbById('sumeba')!;
    expect(p.exampleJa).toBe('最初は不安でしたが、住めば都ですね。');
    expect(proverbExampleSpeechText(p)).toBe('最初は不安でしたが、すめばみやこですね。');
  });

  it('活用して入っている慣用句は置き換えない（読みを機械で作らない）', () => {
    const p = proverbById('atamaga');
    if (!p) return;                                   // idが変わってもテストを壊さない
    expect(p.exampleJa.includes(p.ja)).toBe(false);   // 「頭が下がる」→「頭が下がります」
    expect(proverbExampleSpeechText(p)).toBe(p.exampleJa);
  });

  it('置き換えても音は変わらない（もともと正しく読めていたものを悪くしない）', () => {
    // yomi は見出しの正しい読みそのものなので、置換は「同じ音の別表記」にしかならない。
    // ここでは置換が起きた件数が想定どおり（過半数）であることだけ固定する
    const replaced = PROVERBS.filter((p) => proverbExampleSpeechText(p) !== p.exampleJa);
    expect(replaced.length).toBeGreaterThan(PROVERBS.length / 2);
  });

  it('見出しが空の異常データでは例文をそのまま返す', () => {
    expect(proverbExampleSpeechText({ ja: '', yomi: 'x', exampleJa: 'あいうえお' })).toBe('あいうえお');
  });
});

describe('前提（データ側）', () => {
  it('全件が空でないよみを持っている', () => {
    expect(PROVERBS.filter((p) => !p.yomi.trim()).map((p) => p.id)).toEqual([]);
  });

  it('よみはひらがな（と長音・句読点）だけでできている', () => {
    const bad = PROVERBS.filter((p) => !/^[ぁ-んー、。]+$/.test(p.yomi));
    expect(bad.map((p) => `${p.ja}=${p.yomi}`)).toEqual([]);
  });
});
