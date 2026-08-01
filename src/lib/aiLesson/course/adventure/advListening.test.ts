// 聴解bankの全件検査（COMPLETION §7・§18）。
// 「音声が実在する」「transcriptが解答前に漏れない」を機械で保証する。
import { describe, it, expect } from 'vitest';
import {
  ALL_LISTENING_SETS, playableSets, setsWithoutAudio, listeningCoverage,
  listeningToQuestion, listeningPool, listeningTargetIds, listeningReady,
} from './listening/listeningBank';
import { validateQuestion } from './advVariants';
import { checkText } from './advLanguageIntegrity';
import audioManifest from '../../../../../docs/ai-course/adventure-v2/generated/audio-manifest.json';

describe('聴解 coverage と音声asset（§7）', () => {
  it('N2・N3ともに25セット以上・各type 5セット以上・全て再生可能', () => {
    for (const level of ['N2', 'N3'] as const) {
      const c = listeningCoverage(level);
      expect(c.total).toBeGreaterThanOrEqual(25);
      expect(c.playable).toBe(c.total);
      expect(c.typesBelowMinimum).toEqual([]);
      expect(c.missingAudio).toEqual([]);
      expect(c.pass).toBe(true);
      expect(listeningReady(level)).toBe(true);
    }
  });

  it('**音声manifestが全setを持ち、失敗0**', () => {
    const m = audioManifest as { total: number; available: number; failures: unknown[]; pass: boolean };
    expect(m.total).toBe(ALL_LISTENING_SETS.length);
    expect(m.available).toBe(ALL_LISTENING_SETS.length);
    expect(m.failures).toEqual([]);
    expect(m.pass).toBe(true);
    expect(setsWithoutAudio()).toEqual([]);
  });

  it('音声の長さが原稿の長さに対して妥当（読み上げ失敗の検出）', () => {
    const entries = (audioManifest as { entries: { setId: string; durationSeconds: number; charCount: number }[] }).entries;
    for (const e of entries) {
      expect(e.durationSeconds, `${e.setId} duration`).toBeGreaterThan(1);
      // 1文字あたり0.06〜0.5秒の範囲に収まること
      expect(e.durationSeconds / e.charCount, `${e.setId} sec/char`).toBeGreaterThan(0.06);
      expect(e.durationSeconds / e.charCount, `${e.setId} sec/char`).toBeLessThan(0.5);
    }
  });

  it('durationSecondsが実測値で反映される', () => {
    for (const s of playableSets()) expect(s.durationSeconds).toBeGreaterThan(0);
  });
});

describe('聴解セットの品質（全件）', () => {
  it('必須フィールドが揃い、正解は1つ・選択肢4つ', () => {
    for (const s of ALL_LISTENING_SETS) {
      // 即時応答は一文だけの形式なので下限を別に持つ
      expect(s.transcriptJa.length).toBeGreaterThanOrEqual(s.listeningType === 'quickResponse' ? 8 : 30);
      expect(s.situationJa.length).toBeGreaterThan(0);
      expect(s.situationZh.length).toBeGreaterThan(0);
      expect(s.questionJa.length).toBeGreaterThan(0);
      expect(s.questionZh.length).toBeGreaterThan(0);
      expect(s.explanationJa.length).toBeGreaterThan(0);
      expect(s.explanationZh.length).toBeGreaterThan(0);
      expect(s.choices).toHaveLength(4);
      expect(s.choices.filter((c) => c.isCorrect)).toHaveLength(1);
      expect(new Set(s.choices.map((c) => c.textJa)).size).toBe(4);
      expect([1, 2]).toContain(s.playLimit);
      expect(s.audioAsset).toBe(`/audio/ai-course/${s.setId}.m4a`);
    }
  });

  it('setIdが一意', () => {
    const ids = ALL_LISTENING_SETS.map((s) => s.setId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('**transcriptが問題文・場面説明へ漏れていない**（解答前に読めない）', () => {
    for (const s of ALL_LISTENING_SETS) {
      // 即時応答は「一文を聞いて返事を選ぶ」形式で、原稿＝聞く対象そのもの。
      // 会話文が長い型についてのみ、本文が事前に読めていないことを検査する
      if (s.listeningType === 'quickResponse') continue;
      const core = s.transcriptJa.slice(10, 40);
      expect(core.length).toBeGreaterThan(10);
      expect(s.questionJa.includes(core)).toBe(false);
      expect(s.situationJa.includes(core)).toBe(false);
      expect(s.situationZh.includes(core)).toBe(false);
    }
  });

  it('answer leakage 0（正解文が設問に含まれない）', () => {
    for (const s of ALL_LISTENING_SETS) {
      const correct = s.choices.find((c) => c.isCorrect)!.textJa;
      expect(s.questionJa.includes(correct)).toBe(false);
      expect(s.questionZh.includes(correct)).toBe(false);
    }
  });

  it('誤答すべてに理由がある', () => {
    for (const s of ALL_LISTENING_SETS) {
      for (const c of s.choices.filter((x) => !x.isCorrect)) {
        expect(c.whyWrongJa && c.whyWrongJa.length > 0, `${s.setId}/${c.choiceId}`).toBe(true);
      }
    }
  });

  it('選択肢の長さが極端に不揃いでない', () => {
    for (const s of ALL_LISTENING_SETS) {
      const lens = s.choices.map((c) => c.textJa.length);
      expect(Math.max(...lens) / Math.min(...lens), s.setId).toBeLessThanOrEqual(3.2);
    }
  });

  it('言語整合性: 未許可Script 0（transcript含む全field）', () => {
    for (const s of ALL_LISTENING_SETS) {
      const base = { itemId: s.setId, route: 'listening', origin: 'authored' as never };
      for (const [field, locale, text] of [
        ['transcriptJa', 'targetJa', s.transcriptJa],
        ['situationJa', 'ja', s.situationJa],
        ['situationZh', 'zh', s.situationZh],
        ['questionJa', 'ja', s.questionJa],
        ['questionZh', 'zh', s.questionZh],
        ['explanationJa', 'ja', s.explanationJa],
        ['explanationZh', 'zh', s.explanationZh],
      ] as const) {
        const blocking = checkText({ ...base, field, locale, text }).filter((x) => x.severity === 'blocking');
        expect(blocking, `${s.setId}.${field}: ${blocking.map((b) => b.kind).join(',')}`).toEqual([]);
      }
    }
  });

  it('transcriptに英単語が紛れていない', () => {
    for (const s of ALL_LISTENING_SETS) {
      const stripped = s.transcriptJa.replace(/\b(JLPT|N[1-5]|AI|XP|OK|URL|PDF|M|L|S)\b/g, '');
      expect(/[A-Za-z]{3,}/.test(stripped), `${s.setId}: ${stripped.match(/[A-Za-z]{3,}/)?.[0]}`).toBe(false);
    }
  });
});

describe('聴解 → バトル問題への正規化', () => {
  it('全件が機械検査PASS・skillはlistening・targetJapaneseを出さない', () => {
    for (const s of playableSets()) {
      const q = listeningToQuestion(s);
      expect(validateQuestion(q)).toEqual([]);
      expect(q.skill).toBe('listening');
      expect(q.examSection).toBe('listening');
      expect(q.targetJapanese).toBeNull(); // 文字で読ませない
      expect(q.key.startsWith('listen:')).toBe(true);
      // transcriptは解説のexampleJaにだけ入る（UIが回答後に表示）
      expect(q.explanation.exampleJa).toBe(s.transcriptJa);
    }
  });

  it('プールがtype別に作られ、各5問以上', () => {
    for (const level of ['N2', 'N3'] as const) {
      const pool = listeningPool(level);
      expect(pool.size).toBe(5);
      for (const id of listeningTargetIds(level)) {
        expect((pool.get(id) ?? []).length).toBeGreaterThanOrEqual(5);
      }
    }
  });
});
