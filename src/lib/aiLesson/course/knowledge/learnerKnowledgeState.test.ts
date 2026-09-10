/*
 * 学習者 × 知識項目の状態（2026-09-10 Phase 3）。
 *
 * 守りたいこと:
 *   ・台帳（AdvMasteryLedger）を1件も書き換えない（読むだけ）
 *   ・「選択問題では分かる」と「自分で言える」を同じ習熟にしない
 *   ・昨日「選択○・産出×」なら、今日は同じ文法の産出を最優先に推薦する
 *   ・旧データ（wrongKeys 無し）から正解を推定しない
 *   ・復習は既存の错题本の問題キーへ戻せる
 */
import { describe, it, expect } from 'vitest';
import {
  questionKeyToItem, eventsFromLedger, eventsFromSessions, deriveKnowledgeState, buildKnowledgeState,
  appendKnowledgeEvent, restoreKnowledgeLog, dueKnowledgeItems, reviewKeysForItems,
  nextBestActions, rankWeakGrammarIds, knownButCannotProduce, KNOWLEDGE_LOG_KEEP,
  type KnowledgeEvent,
} from './learnerKnowledgeState';
import { vocabIdIndex } from './vocabIdIndex';
import { recordAttempt } from '../adventure/advMastery';
import type { AdvMasteryLedger } from '../adventure/advTypes';

const dk = (iso: string) => iso.slice(0, 10);
const attempt = (dateKey: string, keys: string[], wrong: string[] | undefined) => ({
  dateKey, scorePct: 80, unseenRatio: 1, questionKeys: keys, tier: 'normal' as const, timed: false,
  completedAt: `${dateKey}T10:00:00.000Z`, ...(wrong ? { wrongKeys: wrong } : {}),
});

describe('問題キー → 知識項目', () => {
  it('文法の4形式はすべて同じ項目の recognition', () => {
    for (const k of ['rec:n3g-takekka', 'cloze:n3g-takekka:1', 'meaning:n3g-takekka', 'form:n3g-takekka']) {
      expect(questionKeyToItem(k)).toEqual({ itemId: 'n3g-takekka', channel: 'recognition' });
    }
  });
  it('語彙キーは索引で wordId へ戻す（本番バンク）', () => {
    const idx = vocabIdIndex();
    const hit = questionKeyToItem('vocab:懸念:けねん:meaning', idx);
    expect(hit?.itemId).toBe('vc-41-002');
  });
  it('**読めないキーは当てずっぽうで繋がない**', () => {
    expect(questionKeyToItem('kanji:n5:1')).toBeNull();
    expect(questionKeyToItem('vocab:存在しない:そんざい:meaning', vocabIdIndex())).toBeNull();
    expect(questionKeyToItem('rec:not-an-id')).toBeNull();
  });
});

describe('台帳からの導出', () => {
  it('台帳を書き換えない・wrongKeys 無しの旧試行は出来事にしない', () => {
    let ledger: AdvMasteryLedger = {};
    ledger = recordAttempt(ledger, 'n3g-a', attempt('2026-09-08', ['rec:n3g-a', 'cloze:n3g-a:1'], ['cloze:n3g-a:1']));
    ledger = recordAttempt(ledger, 'n3g-a', attempt('2026-09-09', ['rec:n3g-a'], undefined));
    const snapshot = JSON.stringify(ledger);
    const ev = eventsFromLedger(ledger);
    expect(JSON.stringify(ledger)).toBe(snapshot);
    expect(ev.map((e) => [e.questionKey, e.ok])).toEqual([['rec:n3g-a', true], ['cloze:n3g-a:1', false]]);
  });

  it('AI会話ミッションは「自分で使えた」だけを成功にする（ヒント付きは成功にしない）', () => {
    const ev = eventsFromSessions([
      { id: 's1', missionId: 'advconv-n3g-a', startedAt: '2026-09-09T01:00:00.000Z', completionStatus: 'completed', report: { targetUsage: 'self' } },
      { id: 's2', missionId: 'advconv-n3g-b', startedAt: '2026-09-09T02:00:00.000Z', completionStatus: 'completed', report: { targetUsage: 'hint' } },
      { id: 's3', missionId: 'advconv-n3g-c', startedAt: '2026-09-09T03:00:00.000Z', completionStatus: 'interrupted', report: { targetUsage: 'self' } },
      { id: 's4', missionId: 'free-talk', startedAt: '2026-09-09T04:00:00.000Z', completionStatus: 'completed', report: { targetUsage: 'self' } },
    ], dk);
    expect(ev.map((e) => [e.itemId, e.ok])).toEqual([['n3g-a', true], ['n3g-b', false]]);
    expect(ev.every((e) => e.channel === 'conversation')).toBe(true);
  });
});

describe('recognition / production / conversation を分ける', () => {
  const events: KnowledgeEvent[] = [
    { at: '2026-09-09T10:00:00.000Z', dateKey: '2026-09-09', itemId: 'n3g-a', channel: 'recognition', kind: 'answer', ok: true, source: 'ledger:n3g-a' },
    { at: '2026-09-09T10:01:00.000Z', dateKey: '2026-09-09', itemId: 'n3g-a', channel: 'recognition', kind: 'answer', ok: true, source: 'ledger:n3g-a' },
    { at: '2026-09-09T10:02:00.000Z', dateKey: '2026-09-09', itemId: 'n3g-a', channel: 'recognition', kind: 'answer', ok: true, source: 'ledger:n3g-a' },
    { at: '2026-09-09T11:00:00.000Z', dateKey: '2026-09-09', itemId: 'n3g-a', channel: 'production', kind: 'restate', ok: false, source: 'restate' },
  ];
  const state = deriveKnowledgeState(events);

  it('選択は solid・産出は failing（同じ mastery にしない）', () => {
    expect(state['n3g-a'].recognition.status).toBe('solid');
    expect(state['n3g-a'].production.status).toBe('failing');
    expect(state['n3g-a'].conversation.status).toBe('untested');
    expect(knownButCannotProduce(state)).toEqual(['n3g-a']);
  });

  it('**昨日「選択○・産出×」→ 今日は同じ文法の production を最優先**（仕様の例）', () => {
    const actions = nextBestActions(state, { dateKey: '2026-09-10' });
    expect(actions[0]).toMatchObject({ itemId: 'n3g-a', action: 'production_retry' });
  });

  it('問題では間違えたが、言い直しでは成功した、を区別できる', () => {
    const s = deriveKnowledgeState([
      { at: '2026-09-09T10:00:00.000Z', dateKey: '2026-09-09', itemId: 'n3g-b', channel: 'recognition', kind: 'answer', ok: false, source: 'ledger:n3g-b' },
      { at: '2026-09-09T10:05:00.000Z', dateKey: '2026-09-09', itemId: 'n3g-b', channel: 'production', kind: 'retry', ok: true, source: 'retry' },
    ]);
    expect(s['n3g-b'].recognition.status).toBe('failing');
    expect(s['n3g-b'].production.status).toBe('shaky');
    expect(s['n3g-b'].production.lastOk).toBe(true);
  });
});

describe('復習への接続', () => {
  it('昨日間違えたもの・忘れかけているものを項目で出す', () => {
    const s = deriveKnowledgeState([
      { at: '2026-09-09T10:00:00.000Z', dateKey: '2026-09-09', itemId: 'n3g-a', channel: 'recognition', kind: 'answer', ok: false, source: 'x' },
      // 8/1 に3連続正解（solid）→ 30日以上空いた＝忘れかけ
      { at: '2026-08-01T10:00:00.000Z', dateKey: '2026-08-01', itemId: 'n3g-b', channel: 'recognition', kind: 'answer', ok: true, source: 'x' },
      { at: '2026-08-01T10:01:00.000Z', dateKey: '2026-08-01', itemId: 'n3g-b', channel: 'recognition', kind: 'answer', ok: true, source: 'x' },
      { at: '2026-08-01T10:02:00.000Z', dateKey: '2026-08-01', itemId: 'n3g-b', channel: 'recognition', kind: 'answer', ok: true, source: 'x' },
      // 今日正解したばかり＝まだ（1回目の正解は翌日に出る＝第1天复习）
      { at: '2026-09-10T08:00:00.000Z', dateKey: '2026-09-10', itemId: 'n3g-c', channel: 'recognition', kind: 'answer', ok: true, source: 'x' },
      { at: '2026-09-09T10:00:00.000Z', dateKey: '2026-09-09', itemId: 'n3g-d', channel: 'recognition', kind: 'answer', ok: true, source: 'x' },
    ]);
    const due = dueKnowledgeItems(s, '2026-09-10');
    expect(due.wrongYesterday).toEqual(['n3g-a']);
    expect([...due.fading].sort()).toEqual(['n3g-b', 'n3g-d']);
  });

  it('**既存の错题本の問題キーへ戻せる**（新しい復習エンジンを作らない）', () => {
    const keys = reviewKeysForItems([
      { questionKey: 'cloze:n3g-a:1', targetId: 'n3g-a', resolution: 'unresolved' },
      { questionKey: 'rec:n3g-a', targetId: 'n3g-a', resolution: 'overcome' },
      { questionKey: 'form:n3g-b', targetId: 'n3g-b', resolution: 'unresolved' },
    ], ['n3g-b', 'n3g-a']);
    expect(keys).toEqual(['form:n3g-b', 'cloze:n3g-a:1']);
  });
});

describe('knowledgeLog', () => {
  it('append-only・上限で古いものから落ちる・壊れた要素は読み戻さない', () => {
    let log: KnowledgeEvent[] = [];
    for (let i = 0; i < KNOWLEDGE_LOG_KEEP + 5; i += 1) {
      log = appendKnowledgeEvent(log, { at: `2026-09-01T00:00:${String(i % 60).padStart(2, '0')}.000Z`, dateKey: '2026-09-01', itemId: `n3g-${i}`, channel: 'production', kind: 'restate', ok: true, source: 'restate' });
    }
    expect(log.length).toBe(KNOWLEDGE_LOG_KEEP);
    expect(log[0].itemId).toBe('n3g-5');
    expect(restoreKnowledgeLog([...log.slice(0, 2), { broken: true }, null])).toHaveLength(2);
    expect(restoreKnowledgeLog(undefined)).toEqual([]);
  });
});

describe('弱点文法の並べ替え・グラフの隣', () => {
  it('産出で失敗している項目が先に来る', () => {
    const s = deriveKnowledgeState([
      { at: '2026-09-09T10:00:00.000Z', dateKey: '2026-09-09', itemId: 'n2g-001', channel: 'recognition', kind: 'answer', ok: false, source: 'x' },
      { at: '2026-09-09T10:00:00.000Z', dateKey: '2026-09-09', itemId: 'n2g-002', channel: 'recognition', kind: 'answer', ok: true, source: 'x' },
      { at: '2026-09-09T11:00:00.000Z', dateKey: '2026-09-09', itemId: 'n2g-002', channel: 'production', kind: 'restate', ok: false, source: 'restate' },
    ]);
    expect(rankWeakGrammarIds(['n2g-001', 'n2g-002', 'n2g-003'], s, '2026-09-10')).toEqual(['n2g-002', 'n2g-001', 'n2g-003']);
  });

  it('関連項目（辺の隣）も崩れていれば prerequisite_review になる', () => {
    const s = deriveKnowledgeState([
      { at: '2026-09-09T10:00:00.000Z', dateKey: '2026-09-09', itemId: 'n2g-010', channel: 'recognition', kind: 'answer', ok: false, source: 'x' },
      { at: '2026-09-08T10:00:00.000Z', dateKey: '2026-09-08', itemId: 'n3g-nitsurete', channel: 'recognition', kind: 'answer', ok: false, source: 'x' },
    ]);
    const a = nextBestActions(s, { dateKey: '2026-09-10', edges: [{ from: 'n2g-010', to: 'n3g-nitsurete' }], candidateIds: ['n2g-010'] });
    expect(a[0]).toMatchObject({ action: 'prerequisite_review', viaItemId: 'n3g-nitsurete' });
  });

  it('全部まとめて作れる（台帳＋セッション＋knowledgeLog）', () => {
    let ledger: AdvMasteryLedger = {};
    ledger = recordAttempt(ledger, 'n3g-a', attempt('2026-09-09', ['rec:n3g-a'], []));
    const s = buildKnowledgeState({
      ledger, dateKeyOf: dk,
      sessions: [{ id: 's1', missionId: 'advconv-n3g-a', startedAt: '2026-09-09T12:00:00.000Z', completionStatus: 'completed', report: { targetUsage: 'none' } }],
      knowledgeLog: [{ at: '2026-09-09T13:00:00.000Z', dateKey: '2026-09-09', itemId: 'n3g-a', channel: 'production', kind: 'restate', ok: true, source: 'restate' }],
    });
    expect(s['n3g-a'].recognition.attempts).toBe(1);
    expect(s['n3g-a'].conversation.status).toBe('failing');
    expect(s['n3g-a'].production.status).toBe('shaky');
  });
});
