/*
 * AI会話 × 知識項目（2026-09-10 Phase 6）。
 *
 * 守りたいこと:
 *   ・会話コースの90ミッションのうち、文法項目に当たるものは全部 grammarId へ繋がる（総合・定型句は繋がなくて正しい）
 *   ・当てずっぽうで繋がない（部分一致は使わない・MANUAL は実在IDだけ）
 *   ・「自分で使えた」だけを成功にする。ヒント付き・直された・使わなかった を区別する
 *   ・会話ログ全文は残さない（structured result だけ）
 */
import { describe, it, expect } from 'vitest';
import {
  buildMissionGrammarMap, conversationOutcome, structuredConversationResults, conversationEvents,
  retryTargetsAfterConversation, grammarIdOfMission, MANUAL_MISSION_GRAMMAR, NON_GRAMMAR_MISSIONS,
} from './conversationKnowledge';
import { buildKnowledgeState } from './learnerKnowledgeState';
import { COURSE_MISSIONS } from '../courseData';
import { loadAllGrammarForLinks } from './crossLinksLoad';

const dk = (iso: string) => iso.slice(0, 10);

describe('missionId → grammarId', () => {
  it('advconv-／bizconv- は ID から直接、会話コースは対応表から', () => {
    expect(grammarIdOfMission('advconv-n3g-teoku')).toBe('n3g-teoku');
    expect(grammarIdOfMission('bizconv-biz-phone-absent:n4g-teorimasu')).toBe('n4g-teorimasu');
    expect(grammarIdOfMission('w03m1', new Map([['w03m1', 'n4g-youninarimasu']]))).toBe('n4g-youninarimasu');
    expect(grammarIdOfMission('w03m1')).toBeNull();
    expect(grammarIdOfMission('advconv-not-an-id')).toBeNull();
  });

  it('**本番の90ミッション**：文法に当たるものは全部繋がり、総合・定型句だけが残る', async () => {
    const grammar = await loadAllGrammarForLinks();
    const { map, unresolved } = buildMissionGrammarMap(COURSE_MISSIONS, grammar);
    const known = new Set(grammar.map((g) => g.grammarId));
    // MANUAL に書いた ID は全部実在する
    for (const [mid, gid] of Object.entries(MANUAL_MISSION_GRAMMAR)) expect(known.has(gid), `${mid} → ${gid}`).toBe(true);
    // 繋がらないのは「文法項目でない」と決めたものだけ
    expect(unresolved.map((m) => m.id)).toEqual([]);
    const integrated = COURSE_MISSIONS.filter((m) => /総合|＋/.test(m.targetExpression)).length;
    expect(map.size).toBe(COURSE_MISSIONS.length - integrated - NON_GRAMMAR_MISSIONS.size);
    expect(map.size).toBeGreaterThanOrEqual(50);
    // 代表例
    expect(map.get('w03m1')?.grammarId).toBe('n4g-youninarimasu');
    expect(map.get('w05m3')?.grammarId).toBe('n4g-teitadakemasenka');
    expect(map.get('w10m2')?.grammarId).toBe('n5g-nakereba-narimasen');
    expect(map.get('w17m2')?.grammarId).toBe('n1g-110');
  }, 120000);
});

describe('会話の結果（structured result）', () => {
  const base = { id: 's1', missionId: 'advconv-n3g-teoku', startedAt: '2026-09-09T10:00:00.000Z', completionStatus: 'completed' };

  it('自分で使えた／ヒント付き／使わなかった／途中終了 を区別する', () => {
    expect(conversationOutcome({ ...base, report: { targetUsage: 'self' } })).toBe('used_self');
    expect(conversationOutcome({ ...base, report: { targetUsage: 'hint' } })).toBe('used_with_hint');
    expect(conversationOutcome({ ...base, report: { targetUsage: 'none' } })).toBe('avoided');
    expect(conversationOutcome({ ...base, completionStatus: 'interrupted', report: { targetUsage: 'self' } })).toBe('incomplete');
    // report が無い旧セッションは targetUsedIndependently で見る
    expect(conversationOutcome({ ...base, targetUsedIndependently: true, report: null })).toBe('used_self');
  });

  it('**使ったが直された**は incorrect（detect が直しの原文に当たる）', () => {
    const s = { ...base, report: { targetUsage: 'self' as const, corrections: [{ original: '窓を開けておきしました', improved: '窓を開けておきました' }] } };
    expect(conversationOutcome(s, 'ておき|ておく')).toBe('incorrect');
    expect(conversationOutcome(s, 'てしまい')).toBe('used_self');
    expect(conversationOutcome(s, '(')).toBe('used_self'); // 壊れた正規表現は判定しない
  });

  it('structured result はログ全文を持たず、言い直しへ回す対象が分かる', () => {
    const sessions = [
      { ...base, report: { targetUsage: 'self' as const, corrections: [] } },
      { ...base, id: 's2', missionId: 'advconv-n4g-temorau', report: { targetUsage: 'none' as const, corrections: [{ original: 'x', improved: 'y' }] } },
      { ...base, id: 's3', missionId: 'w01m1', report: { targetUsage: 'self' as const } },
    ];
    const r = structuredConversationResults(sessions, new Map());
    expect(r.map((x) => [x.grammarId, x.outcome, x.retryTarget])).toEqual([
      ['n3g-teoku', 'used_self', false], ['n4g-temorau', 'avoided', true], [null, 'used_self', false],
    ]);
    for (const x of r) expect(Object.keys(x)).not.toContain('transcript');
    expect(retryTargetsAfterConversation(r)).toEqual(['n4g-temorau']);
    const ev = conversationEvents(r, sessions, dk);
    expect(ev.map((e) => [e.itemId, e.ok])).toEqual([['n3g-teoku', true], ['n4g-temorau', false]]);
  });

  it('会話コースのセッションも対応表を通して knowledge state に入る', () => {
    const state = buildKnowledgeState({
      ledger: {}, dateKeyOf: dk,
      sessions: [{ id: 's9', missionId: 'w03m1', startedAt: '2026-09-09T10:00:00.000Z', completionStatus: 'completed', report: { targetUsage: 'self' } }],
      missionGrammar: new Map([['w03m1', 'n4g-youninarimasu']]),
    });
    expect(state['n4g-youninarimasu'].conversation.status).toBe('shaky');
    expect(state['n4g-youninarimasu'].conversation.lastOk).toBe(true);
  });
});
