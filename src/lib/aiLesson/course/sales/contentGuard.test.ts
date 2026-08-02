// 大量取得・使い逃げ防止の受入テスト（§8 §20）。
//
// 2つを同時に満たす必要がある。
//   A. バンク全体を取れない・順番に叩いても全件に届かない
//   B. **普通に勉強している人が制限表示を見ない**
// Bを落とすと「守れているが使えない」設計になるので、両方を明示的に検査する。

import { describe, it, expect } from 'vitest';
import {
  releaseItems, toDeliverable, capabilitiesFor, canBrowseBank, canExportBank,
  paginateForAdmin, denialMessage, DEFAULT_CONTENT_GUARD, ADMIN_PAGE_SIZE_MAX,
  FORBIDDEN_LEARNER_FIELDS, type InternalItem, type ReleaseRequest,
} from './contentGuard';
import { resolveEntitlement, emptyConsumption, buildGrant } from './entitlement';
import { salesPlanById } from './planConfig';

const T0 = 1_700_000_000_000;

const bank = (n: number): InternalItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `n2g-${String(i).padStart(4, '0')}`,
    bankIndex: i,
    sourceFile: 'n2GrammarDraftsUnit3.ts',
    prompt: `問題${i}`,
    choices: ['A', 'B', 'C', 'D'],
    correctChoiceId: 'B',
    explanationJa: '解説',
    explanationZh: '解说',
    internalNotes: '難易度メモ',
  }));

const activeEntitlement = () => {
  const p = salesPlanById('ai-hour-pass')!;
  const { grant } = buildGrant({
    learnerId: 'L1', planId: 'ai-hour-pass', planVersion: p.version, purchaseId: 'pay_1',
    nowMs: T0, activeMinutes: p.includedActiveMinutes, validityDays: p.validityDays,
    durationDays: p.durationDays, voiceMinutesCap: p.cost.voiceMinutesCap, aiReportCap: p.cost.aiReportCap,
  }, []);
  return resolveEntitlement([grant!], emptyConsumption(), T0);
};

const req = (over: Partial<ReleaseRequest> = {}): ReleaseRequest => ({
  role: 'learner',
  entitlement: activeEntitlement(),
  sessionId: 'sess-1',
  itemsServedInWindow: 0,
  recentRequestTimesMs: [],
  nowMs: T0,
  requestedItems: bank(5),
  ...over,
});

describe('A. バンクを丸ごと取れない', () => {
  it('1回の配信は上限までしか返さない（1万問を要求しても5問）', () => {
    const r = releaseItems(req({ requestedItems: bank(10_000) }));
    expect(r.allowed).toBe(true);
    expect(r.items.length).toBe(DEFAULT_CONTENT_GUARD.maxItemsPerRelease);
  });

  it('内部IDと出典を渡さない（集めても目録にならない）', () => {
    const r = releaseItems(req());
    for (const item of r.items) {
      for (const forbidden of FORBIDDEN_LEARNER_FIELDS) {
        expect(Object.prototype.hasOwnProperty.call(item, forbidden), `${forbidden} が漏れている`).toBe(false);
      }
    }
    expect(JSON.stringify(r.items).includes('n2GrammarDraftsUnit3')).toBe(false);
    expect(JSON.stringify(r.items).includes('n2g-0000')).toBe(false);
  });

  it('配信IDはセッションごとに変わる（別セッションの結果を突き合わせられない）', () => {
    const a = toDeliverable(bank(1)[0], 'sess-A', 0);
    const b = toDeliverable(bank(1)[0], 'sess-B', 0);
    expect(a.deliveryId).not.toBe(b.deliveryId);
  });

  it('順番に叩き続けても、1利用枠の総本数で頭打ちになる', () => {
    let served = 0;
    let requests = 0;
    // レート制限に当たらないよう、十分な間隔を空けて叩き続ける
    for (let i = 0; i < 1000; i++) {
      const r = releaseItems(req({
        itemsServedInWindow: served,
        nowMs: T0 + i * 10_000,
        requestedItems: bank(5),
      }));
      requests += 1;
      if (!r.allowed) break;
      served += r.items.length;
    }
    expect(served).toBe(DEFAULT_CONTENT_GUARD.maxItemsPerWindow);
    expect(requests).toBeLessThan(1000);
    // 教材の総数（1万問規模）には遠く届かない
    expect(served).toBeLessThan(10_000);
  });

  it('短時間の連打は止まる', () => {
    const times = Array.from({ length: DEFAULT_CONTENT_GUARD.burstLimit }, (_, i) => T0 - i * 100);
    const r = releaseItems(req({ recentRequestTimesMs: times }));
    expect(r.allowed).toBe(false);
    expect(r.denial).toBe('rate_limited');
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('利用権が無ければ1問も出ない', () => {
    const none = resolveEntitlement([], emptyConsumption(), T0);
    const r = releaseItems(req({ entitlement: none }));
    expect(r.allowed).toBe(false);
    expect(r.denial).toBe('no_entitlement');
    expect(r.items).toEqual([]);
  });

  it('期限切れの利用権でも出ない', () => {
    const p = salesPlanById('ai-hour-pass')!;
    const { grant } = buildGrant({
      learnerId: 'L1', planId: 'ai-hour-pass', planVersion: p.version, purchaseId: 'x',
      nowMs: T0, activeMinutes: 60, validityDays: 30, durationDays: 0,
      voiceMinutesCap: 10, aiReportCap: 3,
    }, []);
    const expired = resolveEntitlement([grant!], emptyConsumption(), T0 + 31 * 86_400_000);
    expect(releaseItems(req({ entitlement: expired })).denial).toBe('no_entitlement');
  });
});

describe('A. 学習者に一覧・書き出しを開かない', () => {
  it('learner は一覧も書き出しもできない', () => {
    expect(canBrowseBank('learner')).toBe(false);
    expect(canExportBank('learner')).toBe(false);
    expect(capabilitiesFor('learner').seeInternalIds).toBe(false);
  });

  it('管理者QAだけが一覧・書き出しを持つ（権限が完全に分かれている）', () => {
    expect(canBrowseBank('admin_qa')).toBe(true);
    expect(canExportBank('admin_qa')).toBe(true);
    expect(capabilitiesFor('admin_qa').seeInternalIds).toBe(true);
  });

  it('learner のオフセット一覧は拒否される（順番に辿る経路が無い）', () => {
    const r = paginateForAdmin(bank(1000), { role: 'learner', offset: 0, limit: 50 });
    expect(r.allowed).toBe(false);
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(0);           // 総数すら教えない
  });

  it('管理者一覧でも1回で全部は返らない', () => {
    const r = paginateForAdmin(bank(1000), { role: 'admin_qa', offset: 0, limit: 9999 });
    expect(r.rows.length).toBe(ADMIN_PAGE_SIZE_MAX);
    expect(r.nextOffset).toBe(ADMIN_PAGE_SIZE_MAX);
  });

  it('管理者一覧の最後まで辿ると nextOffset が終わる', () => {
    const r = paginateForAdmin(bank(50), { role: 'admin_qa', offset: 0, limit: 100 });
    expect(r.rows.length).toBe(50);
    expect(r.nextOffset).toBeNull();
  });
});

describe('B. 普通に勉強している人が制限に当たらない', () => {
  it('60分ぶん真面目に解いても、一度も止まらない', () => {
    // 1問あたり20秒で解き続ける最速に近いペース（実際はもっと遅い）。
    // 5問ずつ配信されるので、1回の配信は100秒に1回。60分で36回・180問。
    let served = 0;
    const times: number[] = [];
    for (let i = 0; i < 36; i++) {
      const now = T0 + i * 100_000;
      const r = releaseItems(req({ itemsServedInWindow: served, recentRequestTimesMs: [...times], nowMs: now }));
      expect(r.allowed, `${i}回目の配信で止まった`).toBe(true);
      times.push(now);
      served += r.items.length;
    }
    expect(served).toBe(180);
    expect(served).toBeLessThan(DEFAULT_CONTENT_GUARD.maxItemsPerWindow);
  });

  it('通信が詰まって数回リトライしても止まらない', () => {
    // 3秒のあいだに5回の再送（よくある再試行）
    const times = [T0 - 3000, T0 - 2500, T0 - 2000, T0 - 1000, T0 - 500];
    expect(releaseItems(req({ recentRequestTimesMs: times })).allowed).toBe(true);
  });

  it('制限の値が、現実の学習ペースに対して十分な余裕を持つ', () => {
    // 60分で180問が現実的な上限。枠の上限はその2倍以上ある
    expect(DEFAULT_CONTENT_GUARD.maxItemsPerWindow).toBeGreaterThan(180 * 2);
    // 連打の判定も、人の操作速度の何倍も上にある
    expect(DEFAULT_CONTENT_GUARD.burstLimit / DEFAULT_CONTENT_GUARD.burstWindowSeconds)
      .toBeGreaterThan(0.4);   // 秒あたり0.4回以上まで許す
  });
});

describe('止まったときの伝え方', () => {
  it('不正を疑う言い方をしない', () => {
    for (const d of ['no_entitlement', 'window_item_limit', 'rate_limited', 'not_permitted'] as const) {
      for (const lang of ['ja', 'zh'] as const) {
        const msg = denialMessage(d, lang, 12);
        for (const w of ['不正', '違反', 'エラー', 'Error', '错误', '违规']) {
          expect(msg.includes(w), `${d}/${lang} に「${w}」`).toBe(false);
        }
      }
    }
  });

  it('次に何をすればよいかを言う', () => {
    expect(denialMessage('no_entitlement', 'ja')).toContain('購入');
    expect(denialMessage('rate_limited', 'ja', 12)).toContain('12秒');
    expect(denialMessage('window_item_limit', 'ja')).toContain('もう一度ご購入');
  });
});
