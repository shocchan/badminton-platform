// 権限マトリクスの受入テスト。
//
// いちばん守りたいのは **「60分パス・1か月プランに人間の権限を付けない」**。
// 表示だけ「含まれない」でサーバーが素通し、あるいはその逆、という食い違いを
// 起こさないため、権限は planCatalog から機械導出し、ここで結果を固定する。
import { describe, it, expect } from 'vitest';
import {
  entitlementsFor, accessWindowFor, planStateOf, upgradeCreditFor,
} from './planEntitlements';
import { PLAN_CATALOG, UPGRADE_PATHS } from './planCatalog';

describe('権限マトリクス', () => {
  it('**60分パスと1か月プランに人間の権限が一切ない**', () => {
    for (const id of ['ai-trial-pass', 'ai-month'] as const) {
      const e = entitlementsFor(id);
      expect(e.humanLessonCount, `${id}.humanLessonCount`).toBe(0);
      expect(e.humanFeedback, `${id}.humanFeedback`).toBe(false);
      expect(e.personalRoadmap, `${id}.personalRoadmap`).toBe(false);
      expect(e.wechatConsult, `${id}.wechatConsult`).toBe(false);
    }
  });

  it('6か月コースには24回の人間レッスンと伴走権限がある', () => {
    const e = entitlementsFor('coach-6m');
    expect(e.humanLessonCount).toBe(24);
    expect(e.humanFeedback).toBe(true);
    expect(e.personalRoadmap).toBe(true);
    expect(e.wechatConsult).toBe(true);
  });

  it('全プランでAI会話・教材・復習・学習記録が使える', () => {
    for (const p of PLAN_CATALOG) {
      const e = entitlementsFor(p.id);
      expect(e.aiConversation, p.id).toBe(true);
      expect(e.materials, p.id).toBe(true);
      expect(e.review, p.id).toBe(true);
      expect(e.learningRecords, p.id).toBe(true);
    }
  });

  it('体験パスだけリアルタイム60分の窓を持つ（累計上限はどのプランにも無い）', () => {
    expect(entitlementsFor('ai-trial-pass').realtimeWindowMinutes).toBe(60);
    expect(entitlementsFor('ai-month').realtimeWindowMinutes).toBeNull();
    expect(entitlementsFor('coach-6m').realtimeWindowMinutes).toBeNull();
    for (const id of ['ai-trial-pass', 'ai-month', 'coach-6m'] as const) {
      expect(entitlementsFor(id).aiMinutesTotal, id).toBeNull();
    }
  });

  it('**全プラン買い切りで自動更新なし**', () => {
    for (const p of PLAN_CATALOG) {
      expect(entitlementsFor(p.id).autoRenew, p.id).toBe(false);
    }
  });
});

describe('利用期間の計算', () => {
  it('60分パス・1か月プランは購入日から30日間', () => {
    const purchased = '2026-08-19T10:00:00.000Z';
    for (const id of ['ai-trial-pass', 'ai-month'] as const) {
      const w = accessWindowFor(id, purchased);
      expect(w.validFromISO).toBe('2026-08-19T10:00:00.000Z');
      expect(w.validUntilISO).toBe('2026-09-18T10:00:00.000Z');
    }
  });

  it('6か月コースの終了日は個別設定（日数固定にしない）', () => {
    const w = accessWindowFor('coach-6m', '2026-08-19T10:00:00.000Z');
    expect(w.validUntilISO).toBeNull();
  });

  it('30日後は expired、期間内は active、開始前は not_started', () => {
    const w = accessWindowFor('ai-month', '2026-08-19T10:00:00.000Z');
    expect(planStateOf(w, '2026-08-19T09:59:00.000Z')).toBe('not_started');
    expect(planStateOf(w, '2026-09-01T00:00:00.000Z')).toBe('active');
    // 30日後の同時刻ちょうどまでは有効、それを過ぎたら終了
    expect(planStateOf(w, '2026-09-18T10:00:00.000Z')).toBe('active');
    expect(planStateOf(w, '2026-09-18T10:00:01.000Z')).toBe('expired');
  });

  it('終了日が個別設定（null）のプランは期限で expired にならない', () => {
    const w = accessWindowFor('coach-6m', '2026-08-19T10:00:00.000Z');
    expect(planStateOf(w, '2030-01-01T00:00:00.000Z')).toBe('active');
  });
});

describe('アップグレード（1か月 → 6か月）', () => {
  it('データ構造がある（1か月 → 6か月・2,980円分）', () => {
    const u = upgradeCreditFor('ai-month', '2026-08-19T10:00:00.000Z', '2026-08-20T10:00:00.000Z');
    expect(u).not.toBeNull();
    expect(u!.toPlanId).toBe('coach-6m');
    expect(u!.creditJpy).toBe(2980);
  });

  it('**自動割引はまだ有効化しない**（決済・会計・返金条件の確認が先）', () => {
    for (const p of UPGRADE_PATHS) expect(p.status).toBe('planned');
    const u = upgradeCreditFor('ai-month', '2026-08-19T10:00:00.000Z', '2026-08-20T10:00:00.000Z');
    expect(u!.eligible).toBe(false);
  });

  it('アップグレード元にならないプランは null', () => {
    expect(upgradeCreditFor('coach-6m', '2026-08-19T10:00:00.000Z', '2026-08-20T10:00:00.000Z')).toBeNull();
  });
});
