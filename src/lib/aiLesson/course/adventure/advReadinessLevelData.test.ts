// 準備度画面は「その級の実データ」しか出さない（2026-08-18）。
//
// 何が起きていたか:
//   advReadiness.ts が `const level = target === 'N3' ? 'N3' : 'N2'` と丸めていたため、
//   同日に解禁した N5/N4 目標の生徒の準備度画面に **N2の試験構成** が出ていた。
//   実測: computeReadiness('N5').examParts
//        = ["言語知識（文字・語彙・文法）・読解/105分", "聴解/50分"]（＝N2の値）。
//   さらに N5/N4 は聴解の音源が0本なので listening の evidence が原理的に0のままで、
//   ブロッカー「聴解のデータが不足しています（0/20問）」＝解けば埋まるように見えて
//   一生埋まらない条件を出し続けていた。
//
// 直し方:
//   丸めない。本試験データを持たない級では examParts を空にして UI 側で構成カードを出さない。
//   聴解も「あと◯問」ではなく「音源がないので測れない」と言う。
//   **総合準備度を出す条件そのものは緩めない**（聴解ぬきで「総合」を名乗らない・§9）。
import { describe, it, expect } from 'vitest';
import { computeReadiness } from './advReadiness';
import { EXAM_STRUCTURE, hasExamStructure, OVERALL_READINESS_REQUIREMENT } from './advExamSkills';
import { emptySkillProfile } from './advProfile';
import { ACTIVE_TARGET_LEVELS, type AdvMasteryLedger, type JlptLevel } from './advTypes';
import { listeningSetsFor } from './listening/listeningBank';
import { mockLevelOf } from './advMock';

const report = (target: JlptLevel, ledger: AdvMasteryLedger = {}, mockLog: { completedAt: string }[] = []) =>
  computeReadiness(target, emptySkillProfile(), ledger, mockLog);

describe('本試験の構成は、その級のデータがあるときだけ出す', () => {
  it('N5・N4 は examParts が空・examStructureKnown=false（上の級で代用しない）', () => {
    for (const target of ['N5', 'N4'] as const) {
      const r = report(target);
      expect(r.target).toBe(target);
      expect(r.examStructureKnown).toBe(false);
      expect(r.examParts).toHaveLength(0);
    }
  });

  it('N5・N4 の準備度に N2/N3 の試験時間が一切出ない（丸めの再発検知）', () => {
    const knownMinutes = Object.values(EXAM_STRUCTURE).flat().map((p) => p.minutes);
    for (const target of ['N5', 'N4'] as const) {
      const minutes = report(target).examParts.map((p) => p.minutes);
      expect(minutes.some((m) => knownMinutes.includes(m))).toBe(false);
    }
  });

  it('N3・N2 は従来どおり自分の級の構成を出す', () => {
    expect(report('N2').examParts.map((p) => p.minutes)).toEqual([105, 50]);
    expect(report('N3').examParts.map((p) => p.minutes)).toEqual([30, 70, 40]);
    expect(report('N2').examStructureKnown).toBe(true);
    expect(report('N3').examStructureKnown).toBe(true);
  });

  it('hasExamStructure の正準は EXAM_STRUCTURE のキー', () => {
    for (const lv of ['N5', 'N4', 'N3', 'N2', 'N1'] as const) {
      expect(hasExamStructure(lv)).toBe(Object.prototype.hasOwnProperty.call(EXAM_STRUCTURE, lv));
    }
    expect(hasExamStructure(null)).toBe(false);
    expect(hasExamStructure(undefined)).toBe(false);
  });
});

describe('聴解が測れない級では「あと◯問」と言わない', () => {
  /**
   * listeningMeasurable は hasExamStructure から導いている。
   * いまは「本試験データを持つ級」＝「聴解の音源を持つ級」＝「模試を出せる級」で一致する。
   * 音源だけ先に増やす／試験データだけ先に足すと文言が嘘になるので、ここで落とす。
   */
  it('本試験データを持つ級と、聴解の音源を持つ級と、模試を出せる級が一致する', () => {
    for (const target of ACTIVE_TARGET_LEVELS) {
      const hasStructure = hasExamStructure(target);
      expect(listeningSetsFor(target as 'N5' | 'N4' | 'N3' | 'N2').length > 0).toBe(hasStructure);
      expect(mockLevelOf(target) !== null).toBe(hasStructure);
      expect(report(target).listeningMeasurable).toBe(hasStructure);
    }
  });

  it('N5・N4 のブロッカーは「0/20問」ではなく「音源がないので測れない」', () => {
    for (const target of ['N5', 'N4'] as const) {
      const r = report(target);
      const listeningBlockers = r.overallBlockersJa.filter((b) => b.includes('聴解'));
      expect(listeningBlockers).toHaveLength(1);
      expect(listeningBlockers[0]).not.toContain(`0/${OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill}問`);
      expect(listeningBlockers[0]).toContain('音源');
      // 中国語側も同じ扱い
      expect(r.overallBlockersZh.filter((b) => b.includes('听力'))).toHaveLength(1);
      // 行の注記も「まだ測定していません」（＝これから測れる）と言わない
      const row = r.rows.find((x) => x.key === 'listening')!;
      expect(row.pct).toBeNull();
      expect(row.noteJa).toContain('音源');
    }
  });

  it('N3・N2 は従来どおり「あと◯問」で案内する（緩めていないこと）', () => {
    for (const target of ['N3', 'N2'] as const) {
      const r = report(target);
      expect(r.listeningMeasurable).toBe(true);
      expect(r.overallBlockersJa.some((b) => b.includes(`聴解のデータが不足しています（0/${OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill}問）`))).toBe(true);
    }
  });
});

describe('総合準備度の条件は緩めない（§9）', () => {
  /** 聴解**以外**をやり切った台帳（未出・7日後・時間つきをすべて満たす） */
  const allButListening = (): AdvMasteryLedger => {
    const mk = (skill: string, dayOffset: number) => ({
      dateKey: '2026-01-01',
      scorePct: 100,
      unseenRatio: 1,
      questionKeys: Array.from({ length: 40 }, (_, i) => `${skill}-${dayOffset}-${i}`),
      tier: 'normal' as const,
      timed: true,
      completedAt: new Date(Date.parse('2026-01-01T00:00:00Z') + dayOffset * 86400000).toISOString(),
      skills: [skill],
      bySkill: { [skill]: { correct: 40, total: 40, unseen: 40 } },
      wrongKeys: [],
    });
    const ledger: AdvMasteryLedger = {};
    for (const s of ['charactersVocabulary', 'grammar', 'reading']) {
      ledger[`${s}-x`] = [mk(s, 0), mk(s, 30)];
    }
    return ledger;
  };
  const threeMocks = [{ completedAt: 'a' }, { completedAt: 'b' }, { completedAt: 'c' }];

  it('N5・N4 は聴解が測れない以上、総合を出さない（文言だけ直して数字を出さない）', () => {
    for (const target of ['N5', 'N4'] as const) {
      const r = report(target, allButListening(), threeMocks);
      expect(r.overallPct).toBeNull();
      expect(r.overallGate.listeningEvidence).toBe(false);
      // 他の条件は満たせている＝残っているのは聴解だけ、と言えること
      expect(r.overallGate.languageKnowledgeEvidence).toBe(true);
      expect(r.overallGate.readingEvidence).toBe(true);
      expect(r.overallGate.timedEvidence).toBe(true);
      expect(r.overallGate.delayedEvidence).toBe(true);
      expect(r.summaryJa).toContain('総合準備度はまだ判定できません');
    }
  });
});
