// 錯題本の「何を間違えたか」と「解き直し」が実データで成立するか（2026-08-23）。
//
// 【なぜ要るか】
// 本番実測で、錯題本に誤答18件があるのに
//   ①18行すべてが「词汇」とだけ表示され、どの語を間違えたのか1件も分からない
//   ②「现在这里没有可以重做的题」＝解き直せない
// という状態だった。原因は、語彙の問題が文法プール（pools.byItem）に存在せず、
// 画面がそこしか見ていなかったこと。
//
// 直したあと大事なのは「キーから元の問題を**完全一致で**引けること」。
// ここがズレると、解き直しバトルが空になって行き止まりに戻る。
import { describe, it, expect } from 'vitest';
import { buildVocabQuestions, vocabScopedActive, VOCAB_POOL_SEED } from './vocabQuestions';
import { vocabPoolForKeys, VOCAB_MISTAKE_POOL_ID } from './vocabSubset';
import { parseVocabMistakeKey } from '../advMistakeNotebook';

/** 実データから、誤答キーになりうる本物のキーを n 件ぶん取り出す */
const realKeys = (level: 'N2' | 'N3', n: number): string[] => {
  const active = vocabScopedActive(level);
  const keys: string[] = [];
  for (let i = 0; i < active.length && keys.length < n; i++) {
    const built = buildVocabQuestions(active[i], active, VOCAB_POOL_SEED + i * 31);
    if (built.length > 0) keys.push(built[0].key);
  }
  return keys;
};

describe('parseVocabMistakeKey: キーから語を取り出す', () => {
  it('語彙キーから表記・読み・観点を取り出す', () => {
    expect(parseVocabMistakeKey('vocab:経済:けいざい:meaning'))
      .toEqual({ surface: '経済', reading: 'けいざい', aspect: 'meaning' });
  });

  it('語彙以外のキーは null（文法の誤答を語として出さない）', () => {
    expect(parseVocabMistakeKey('cloze:n2-012')).toBeNull();
    expect(parseVocabMistakeKey('rec:n2-012:3')).toBeNull();
  });

  it('壊れたキーで例外にならない', () => {
    for (const k of ['', 'vocab', 'vocab:', 'vocab:a:b', 'vocab::b:c']) {
      expect(() => parseVocabMistakeKey(k)).not.toThrow();
    }
    expect(parseVocabMistakeKey('vocab:a:b')).toBeNull();
  });

  it('実データのキーがすべて解析できる（キー形式が変わったら落ちる）', () => {
    const keys = realKeys('N3', 20);
    expect(keys.length, '実データからキーが取れない＝前提が壊れている').toBeGreaterThan(10);
    for (const k of keys) {
      const p = parseVocabMistakeKey(k);
      expect(p, `解析できないキー: ${k}`).not.toBeNull();
      expect(p!.surface.length).toBeGreaterThan(0);
      expect(p!.reading.length).toBeGreaterThan(0);
    }
  });
});

describe('vocabPoolForKeys: 誤答キーから解き直し用の問題を作り直す', () => {
  for (const level of ['N3', 'N2'] as const) {
    it(`${level}: 渡したキーがすべてプールに入っている（＝解き直しが空にならない）`, () => {
      const keys = realKeys(level, 12);
      expect(keys.length).toBeGreaterThan(5);
      const pool = vocabPoolForKeys(level, keys);
      const got = new Set([...pool.values()].flat().map((q) => q.key));
      for (const k of keys) {
        expect(got.has(k), `キーが復元できない: ${k}（解き直しバトルが空になる）`).toBe(true);
      }
    });
  }

  it('プールの中身は「その語の問題」だけ（無関係な語を混ぜない）', () => {
    const keys = realKeys('N3', 3);
    const pool = vocabPoolForKeys('N3', keys);
    const wanted = new Set(keys.map((k) => {
      const p = parseVocabMistakeKey(k)!;
      return `${p.surface} ${p.reading}`;
    }));
    for (const q of [...pool.values()].flat()) {
      const p = parseVocabMistakeKey(q.key)!;
      expect(wanted.has(`${p.surface} ${p.reading}`), `頼んでいない語が混ざった: ${q.key}`).toBe(true);
    }
  });

  it('表示に使う情報が揃っている（語と中国語の意味）', () => {
    const keys = realKeys('N3', 5);
    const qs = [...vocabPoolForKeys('N3', keys).values()].flat();
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      // 画面はこの2つで「何を間違えたか」を出す
      expect(q.targetJapanese ?? parseVocabMistakeKey(q.key)?.surface).toBeTruthy();
      expect(q.explanation.meaningZh.length, '中国語の意味が空だと中文画面で何も出ない').toBeGreaterThan(0);
    }
  });

  it('空・不正な入力では空のプールを返す（例外にしない）', () => {
    expect(vocabPoolForKeys('N3', []).size).toBe(0);
    expect(vocabPoolForKeys('N3', ['cloze:n2-001', '', 'vocab:']).size).toBe(0);
  });

  it('存在しない語のキーは黙って無視する（作り話をしない）', () => {
    const pool = vocabPoolForKeys('N3', ['vocab:実在しない語:じつざいしないご:meaning']);
    expect(pool.size).toBe(0);
  });

  it('プールIDがバンド名と紛れない', () => {
    expect(VOCAB_MISTAKE_POOL_ID).toBe('vocab-mistake-redo');
  });

  it('同じキーを2回渡しても問題が重複しない', () => {
    const [k] = realKeys('N3', 1);
    const qs = [...vocabPoolForKeys('N3', [k, k]).values()].flat();
    expect(new Set(qs.map((q) => q.key)).size).toBe(qs.length);
  });
});
