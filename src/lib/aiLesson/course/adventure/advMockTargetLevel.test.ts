// ミニ模試は「本人が選んだ目標レベル」のものだけを出す（2026-08-18）。
//
// 何が起きていたか:
//   AdvShell は模試のレベルを `prof.targetJlpt === 'N3' ? 'N3' : 'N2'` で決めていた。
//   同日に N5/N4 を目標として解禁したので、**N5目標の生徒の level が 'N2' に丸まり**、
//   ホームに「N2ミニ模試（時間つき）」と出て、押すと N2 の読解120セット・
//   N2 の聴解100本・N2語彙（是正／ぜせい 等）が出題されていた。
//   実測: 目標N5で startMockSession すると read:n2r-theme-09 / listen:n2l-task-01 が出た。
//
// 直し方:
//   丸めずに `mockLevelOf` で null を返し、模試の入口自体を出さない。
//   N5/N4 は聴解の音源が0本で、本試験の科目構成（EXAM_STRUCTURE）と
//   本番時間（FULL_TIME_SEC）も持っていないので、上の級で代用しない（原則13）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildMockSpec, mockLevelOf, MOCK_LEVELS } from './advMock';
import { startMockSession } from './advMockSession';
import { EXAM_STRUCTURE } from './advExamSkills';
import { ACTIVE_TARGET_LEVELS } from './advTypes';
import { readingPool } from './reading/readingBank';
import { listeningPool } from './listening/listeningBank';
import { mockVocabPool } from './vocab/vocabSubset';
import type { AdvBattleQuestion } from './advVariants';

const ADV_SHELL = readFileSync('src/components/ai-course/adventure/AdvShell.tsx', 'utf8');
/** 「なぜ直したか」の説明コメントに旧コードが載るのは正しいので、検査は実コードだけ見る */
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SHELL_CODE = codeOnly(ADV_SHELL);

const SEED = 1755500000000;

describe('mockLevelOf: 出せない級では丸めずに null を返す', () => {
  it('**N5・N4は自分の級のまま**（2026-08-20 解禁。上の級の模試で代用しない）', () => {
    expect(mockLevelOf('N5')).toBe('N5');
    expect(mockLevelOf('N4')).toBe('N4');
  });

  it('N1 は null（教材そのものが無い級を「在る」ように見せない）', () => {
    expect(mockLevelOf('N1')).toBeNull();
  });

  it('N3・N2 は自分の級のまま。目標未設定（会話目的）は従来どおりN2', () => {
    expect(mockLevelOf('N3')).toBe('N3');
    expect(mockLevelOf('N2')).toBe('N2');
    expect(mockLevelOf(null)).toBe('N2');
    expect(mockLevelOf(undefined)).toBe('N2');
  });

  it('MOCK_LEVELS は本試験データ（EXAM_STRUCTURE）を持つ級と一致する', () => {
    // 教材だけ足して EXAM_STRUCTURE を足し忘れる／その逆を防ぐ
    expect([...MOCK_LEVELS].sort()).toEqual(Object.keys(EXAM_STRUCTURE).sort());
  });

  it('解禁済みの目標レベルはすべて mockLevelOf で判定できる（増やしたとき落ちる）', () => {
    for (const target of ACTIVE_TARGET_LEVELS) {
      const lv = mockLevelOf(target);
      expect(lv === null || (MOCK_LEVELS as readonly string[]).includes(lv)).toBe(true);
    }
  });
});

describe('模試の中身が目標レベルを超えない（実データで確認）', () => {
  const sessionFor = (level: 'N2' | 'N3') => {
    const rPool = readingPool(level);
    const lPool = listeningPool(level);
    const vPool = mockVocabPool(level, SEED);
    const merged = new Map<string, AdvBattleQuestion[]>();
    for (const [k, v] of rPool) merged.set(k, v);
    for (const [k, v] of lPool) merged.set(k, v);
    for (const [k, v] of vPool) merged.set(k, v);
    let vocabCount = 0; let grammarCount = 0;
    for (const qs of vPool.values()) {
      for (const q of qs) {
        if (q.skill === 'charactersVocabulary') vocabCount += 1;
        else if (q.skill === 'grammar') grammarCount += 1;
      }
    }
    const spec = buildMockSpec(level, {
      vocabCount,
      grammarCount,
      readingCount: [...rPool.values()].reduce((n, v) => n + v.length, 0),
      listeningCount: [...lPool.values()].reduce((n, v) => n + v.length, 0),
    });
    const rt = startMockSession(spec, merged, 'short', SEED, '2026-08-18T00:00:00Z');
    if (!rt) throw new Error(`${level} の模試が組めない`);
    return { spec, questions: rt.sections.flatMap((s) => s.questions) };
  };

  it('N3目標の模試に N2 の問題が1問も混ざらない', () => {
    const { spec, questions } = sessionFor('N3');
    expect(spec.titleJa.startsWith('N3')).toBe(true);
    expect(questions.filter((q) => q.level === 'n2')).toHaveLength(0);
    expect(questions.filter((q) => q.key.startsWith('read:n2'))).toHaveLength(0);
    expect(questions.filter((q) => q.key.startsWith('listen:n2'))).toHaveLength(0);
  }, 300_000);

  it('**N5・N4 も自分の級の模試を出す**（2026-08-20 解禁）。本試験データを持っている', () => {
    for (const target of ['N5', 'N4'] as const) {
      expect(mockLevelOf(target)).toBe(target);
      // 本試験の科目・時間データ（公式値）を持っている＝「◯分」を推測で書かない
      expect(Object.prototype.hasOwnProperty.call(EXAM_STRUCTURE, target)).toBe(true);
    }
  });

  it('**聴解の在庫が無い級では聴解sectionを含めない**（無いものを在るように見せない）', () => {
    for (const target of ['N5', 'N4'] as const) {
      const listeningCount = [...listeningPool(target).values()].reduce((n, v) => n + v.length, 0);
      // 在庫の有無にかかわらず、specは実在庫からしか section を作らない
      const spec = buildMockSpec(mockLevelOf(target)!, {
        vocabCount: 50, grammarCount: 50, readingCount: 20, listeningCount,
      });
      const hasListeningSection = spec.sections.some((s) => s.sectionId === 'listening');
      expect(hasListeningSection, `${target}: 在庫${listeningCount}問と section の有無が食い違う`)
        .toBe(listeningCount >= 4);
      // 4技能そろわないうちは「総合ミニ模試」と名乗らない
      if (!hasListeningSection) {
        expect(spec.ready).toBe(false);
        expect(spec.titleJa).toContain('一部科目');
      }
    }
  });
});

describe('AdvShell の配線（N2丸めが戻ってこないこと）', () => {
  /**
   * 模試「ビュー」のブロックだけを切り出す。
   * `if (view === 'mock')` は語彙プールの注文（vocabRequest）にもあるので、
   * 描画側だけを見るために最後の出現を使う。
   */
  const mockView = (() => {
    const start = SHELL_CODE.lastIndexOf("if (view === 'mock')");
    expect(start, '模試ビューが見つからない').toBeGreaterThan(-1);
    const block = SHELL_CODE.slice(start, start + 4000);
    expect(block, '切り出した範囲に模試の組み立てが含まれていない').toContain('buildMockSpec(');
    return block;
  })();

  it('模試ビューは mockLevel から在庫を引く（level のN2丸めを使わない）', () => {
    expect(mockView).toMatch(/readingPool\(mockLevel\)/);
    expect(mockView).toMatch(/listeningPool\(mockLevel\)/);
    expect(mockView).toMatch(/buildMockSpec\(mockLevel,/);
    expect(mockView).not.toMatch(/readingPool\(level\)/);
    expect(mockView).not.toMatch(/listeningPool\(level\)/);
    expect(mockView).not.toMatch(/buildMockSpec\(level,/);
  });

  it('模試を出せない級で模試ビューに入っても、上の級の模試を出さずに理由を書く', () => {
    expect(mockView).toMatch(/mockLevel === null/);
  });

  it('ホームの模試リンクは mockLevel でラベルを作り、null のときは出さない', () => {
    // 旧: label={tx(lang, `${level}ミニ模試（時間つき）`, ...)} が無条件に描かれていた
    expect(SHELL_CODE).not.toMatch(/\$\{level\}ミニ模試/);
    expect(SHELL_CODE).toMatch(/\$\{mockLevel\}ミニ模試/);
    expect(SHELL_CODE).toMatch(/mockLevel !== null && \(\s*<SubLink/);
  });

  it('準備度画面の「ミニ模試を受ける」も同じ条件で出し分ける', () => {
    expect(SHELL_CODE).toMatch(/mockLevel !== null \?[\s\S]{0,400}ミニ模試を受ける/);
  });

  it('再開できない模試を「途中です」と言い続けない（行き止まりを作らない）', () => {
    expect(SHELL_CODE).toMatch(/mockResumable/);
    expect(SHELL_CODE).toMatch(/const mockResumable = prof\.mockSession !== null && mockLevel !== null/);
  });
});
