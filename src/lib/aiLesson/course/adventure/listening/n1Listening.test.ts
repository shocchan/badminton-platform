/*
 * N1聴解（2026-09-10 Phase 2-3）。
 *
 * 全件共通の品質規則（音声実在・正解1つ・長さバイアス・言語整合）は advListening.test.ts が見る。
 * ここでは N1 だけが持つもの＝**模試1回分の配分**と**知識グラフへの接続**を固定する。
 *
 * 守りたいこと:
 *   ・本試験の配分どおり（課題6・ポイント7・概要6・即時14・統合5）
 *   ・knowledge の grammarLinks / vocabularyLinks が**実在する N1 のID**を指す（dangling を作らない）
 *   ・N1 の原稿は N1 の文法・語彙を実際に含む（リンクが飾りでない）
 *   ・模試へ 'n1' 帯として入る（N2 に丸められない）
 */
import { describe, it, expect } from 'vitest';
import { N1_LISTENING_SETS_A } from './n1ListeningSetsA';
import { listeningToQuestion, listeningSetsFor, listeningCoverage } from './listeningBank';
import { PRACTICAL_DOMAINS } from '../../knowledge/practicalAxis';
import { parseKnowledgeId } from '../../knowledge/knowledgeId';
import { vocabScopedActive } from '../vocab/vocabQuestions';
import { N1_GRAMMAR_DRAFTS_UNIT1 } from '../../n1GrammarDraftsUnit1';
import { N1_GRAMMAR_DRAFTS_UNIT2 } from '../../n1GrammarDraftsUnit2';
import { N1_GRAMMAR_DRAFTS_UNIT3 } from '../../n1GrammarDraftsUnit3';
import { N1_GRAMMAR_DRAFTS_UNIT4 } from '../../n1GrammarDraftsUnit4';
import { N1_GRAMMAR_DRAFTS_UNIT5 } from '../../n1GrammarDraftsUnit5';
import { N1_GRAMMAR_DRAFTS_UNIT6 } from '../../n1GrammarDraftsUnit6';
import { N1_GRAMMAR_DRAFTS_UNIT7 } from '../../n1GrammarDraftsUnit7';
import { N1_GRAMMAR_DRAFTS_UNIT8 } from '../../n1GrammarDraftsUnit8';
import { N1_GRAMMAR_DRAFTS_UNIT9 } from '../../n1GrammarDraftsUnit9';
import { N1_GRAMMAR_DRAFTS_UNIT10 } from '../../n1GrammarDraftsUnit10';

const N1_GRAMMAR = [
  ...N1_GRAMMAR_DRAFTS_UNIT1, ...N1_GRAMMAR_DRAFTS_UNIT2, ...N1_GRAMMAR_DRAFTS_UNIT3, ...N1_GRAMMAR_DRAFTS_UNIT4,
  ...N1_GRAMMAR_DRAFTS_UNIT5, ...N1_GRAMMAR_DRAFTS_UNIT6, ...N1_GRAMMAR_DRAFTS_UNIT7, ...N1_GRAMMAR_DRAFTS_UNIT8,
  ...N1_GRAMMAR_DRAFTS_UNIT9, ...N1_GRAMMAR_DRAFTS_UNIT10,
];
const grammarById = new Map(N1_GRAMMAR.map((g) => [g.grammarId, g]));
const n1Vocab = (vocabScopedActive('N1' as never) as { wordId: string; surface: string; level?: string }[])
  .filter((w) => w.level === 'N1');
const vocabById = new Map(n1Vocab.map((w) => [w.wordId, w]));

/**
 * 「〜を余儀なくされる」→ 原稿に出る芯。波線・括弧・スラッシュの片側を落とす。
 * 原稿では活用する（余儀なくされそう／ざるを得なかった／には及びません）ので、
 * 芯の**前半（半分以上・2文字以上）**が出ていれば「原稿に出ている」とみなす。
 */
const stems = (pattern: string): string[] =>
  pattern.replace(/（[^）]*）/g, '').split(/[／/]/)
    .map((p) => p.replace(/[〜～\s]/g, '').replace(/\(.*?\)/g, ''))
    .filter((p) => p.length >= 2);
const appearsIn = (transcript: string, stem: string): boolean => {
  const chars = [...stem];
  const min = Math.max(2, Math.ceil(chars.length / 2));
  for (let n = chars.length; n >= min; n -= 1) {
    if (transcript.includes(chars.slice(0, n).join(''))) return true;
  }
  return false;
};

describe('N1聴解 模試1回分', () => {
  it('配分が本試験どおり（課題6・ポイント7・概要6・即時14・統合5＝38）', () => {
    const by: Record<string, number> = {};
    for (const s of N1_LISTENING_SETS_A) by[s.listeningType] = (by[s.listeningType] ?? 0) + 1;
    expect(by).toEqual({
      taskComprehension: 6, pointComprehension: 7, outlineComprehension: 6, quickResponse: 14, integrated: 5,
    });
    expect(N1_LISTENING_SETS_A.length).toBe(38);
  });

  it('全件 sourceLevel=N1・IDは n1l- で始まる', () => {
    for (const s of N1_LISTENING_SETS_A) {
      expect(s.sourceLevel).toBe('N1');
      expect(s.setId.startsWith('n1l-'), s.setId).toBe(true);
    }
  });

  it('**音声が実在し、N1 として出題できる**（coverage PASS）', () => {
    expect(listeningSetsFor('N1').length).toBe(38);
    const c = listeningCoverage('N1');
    expect(c.missingAudio).toEqual([]);
    expect(c.pass).toBe(true);
  });

  it('模試へ n1 帯として入る（N2 に丸められない）', () => {
    for (const s of N1_LISTENING_SETS_A) expect(listeningToQuestion(s).level).toBe('n1');
  });
});

describe('N1聴解 知識グラフへの接続', () => {
  it('全件に knowledge がある', () => {
    for (const s of N1_LISTENING_SETS_A) {
      expect(s.knowledge, s.setId).toBeTruthy();
      expect(s.knowledge!.comprehensionTarget.length, s.setId).toBeGreaterThan(5);
      expect(s.knowledge!.distractorDesign.length, s.setId).toBeGreaterThan(5);
      expect(PRACTICAL_DOMAINS, s.setId).toContain(s.knowledge!.domain);
    }
  });

  it('**grammarLinks は実在する N1 文法ID**で、その文法が原稿に実際に出る', () => {
    for (const s of N1_LISTENING_SETS_A) {
      for (const id of s.knowledge!.grammarLinks) {
        expect(parseKnowledgeId(id)?.kind, `${s.setId} → ${id}`).toBe('grammar');
        expect(parseKnowledgeId(id)?.level, `${s.setId} → ${id}`).toBe('N1');
        const g = grammarById.get(id);
        expect(g, `${s.setId} → ${id} が N1 文法に無い`).toBeTruthy();
        const hit = stems(g!.pattern).some((stem) => appearsIn(s.transcriptJa, stem));
        expect(hit, `${s.setId}: 「${g!.pattern}」(${id}) が原稿に出ていない`).toBe(true);
      }
    }
  });

  it('**vocabularyLinks は実在する N1 語彙ID**で、その語が原稿に実際に出る', () => {
    for (const s of N1_LISTENING_SETS_A) {
      for (const id of s.knowledge!.vocabularyLinks) {
        const w = vocabById.get(id);
        expect(w, `${s.setId} → ${id} が N1 語彙に無い`).toBeTruthy();
        expect(s.transcriptJa.includes(w!.surface), `${s.setId}: 「${w!.surface}」(${id}) が原稿に出ていない`).toBe(true);
      }
    }
  });

  it('会話・独話の型（即時応答以外）には N1 文法が1つ以上リンクされている', () => {
    for (const s of N1_LISTENING_SETS_A.filter((x) => x.listeningType !== 'quickResponse')) {
      expect(s.knowledge!.grammarLinks.length, s.setId).toBeGreaterThan(0);
    }
  });

  it('リンクされる文法・語彙が偏っていない（同じ項目ばかりを使い回さない）', () => {
    const g = new Set(N1_LISTENING_SETS_A.flatMap((s) => s.knowledge!.grammarLinks));
    const v = new Set(N1_LISTENING_SETS_A.flatMap((s) => s.knowledge!.vocabularyLinks));
    expect(g.size).toBeGreaterThanOrEqual(40);
    expect(v.size).toBeGreaterThanOrEqual(40);
  });

  it('分野が複数にまたがる（work だけにしない）', () => {
    const d = new Set(N1_LISTENING_SETS_A.map((s) => s.knowledge!.domain));
    expect(d.size).toBeGreaterThanOrEqual(6);
  });
});
