// 申込記録と同意記録の受入テスト。
//
// 守りたいのは **「あとから再現できること」**。
// 価格や規約を変えたあとでも、その人が何を見て何に同意したかを特定できないと、
// 記録として意味がない。
import { describe, it, expect } from 'vitest';
import {
  buildApplication, validateApplication, newApplicationId,
  APPLICATION_STATUSES, VALIDATION_MESSAGE,
} from './planApplication';
import { planById, PLAN_CATALOG } from './planCatalog';
import { TERMS_VERSION } from '../legal/termsVersion';

const NOW = '2026-08-02T12:00:00.000Z';
const plan = () => planById('coach-6m')!;

describe('申込の組み立て', () => {
  it('最低項目がすべて埋まる', () => {
    const { application: a } = buildApplication({
      plan: plan(), locale: 'ja', name: '山田太郎', email: 'a@example.com', nowISO: NOW,
    });
    expect(a.applicationId.length).toBeGreaterThan(0);
    expect(a.selectedPlanId).toBe('coach-6m');
    expect(a.displayedPriceLabel.length).toBeGreaterThan(0);
    expect(a.planVersion).toBe(plan().version);
    expect(a.applicationAt).toBe(NOW);
    expect(a.locale).toBe('ja');
    expect(a.applicationStatus).toBe('submitted');
  });

  it('**申込者が見た言語の価格ラベルを写し取る**（あとで価格を変えても遡って壊れない）', () => {
    const ja = buildApplication({ plan: plan(), locale: 'ja', name: 'a', email: 'a@b.co', nowISO: NOW });
    const zh = buildApplication({ plan: plan(), locale: 'zh', name: 'a', email: 'a@b.co', nowISO: NOW });
    expect(ja.application.displayedPriceLabel).toBe(plan().priceLabelJa);
    expect(zh.application.displayedPriceLabel).toBe(plan().priceLabelZh);
    expect(ja.application.displayedPriceLabel).not.toBe(zh.application.displayedPriceLabel);
  });

  it('同意は申込と同じIDに紐づき、規約の版を持つ', () => {
    const { application, consent } = buildApplication({
      plan: plan(), locale: 'zh', name: 'a', email: 'a@b.co', nowISO: NOW,
    });
    expect(consent.subjectId).toBe(application.applicationId);
    expect(consent.subjectKind).toBe('application');
    expect(consent.termsVersion).toBe(TERMS_VERSION);
    expect(consent.consentedAt).toBe(NOW);
    expect(consent.locale).toBe('zh');
  });

  it('氏名・メール・備考の前後の空白を落とす', () => {
    const { application: a } = buildApplication({
      plan: plan(), locale: 'ja', name: '  山田  ', email: '  a@b.co ', note: ' メモ ', nowISO: NOW,
    });
    expect(a.name).toBe('山田');
    expect(a.email).toBe('a@b.co');
    expect(a.note).toBe('メモ');
  });

  it('備考が未入力でも空文字で埋まる（undefinedを保存しない）', () => {
    const { application: a } = buildApplication({
      plan: plan(), locale: 'ja', name: 'a', email: 'a@b.co', nowISO: NOW,
    });
    expect(a.note).toBe('');
  });

  it('申込IDが衝突しない', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newApplicationId()));
    expect(ids.size).toBe(200);
  });
});

describe('申込の検証', () => {
  const ok = { planId: 'coach-6m', name: '山田', email: 'a@b.co', consentChecked: true };

  it('正しい入力は通る', () => {
    expect(validateApplication(ok)).toEqual([]);
  });

  it('**draft のプランIDを直接投げても通さない**', () => {
    const draft = PLAN_CATALOG.find((p) => p.status === 'draft')!;
    expect(validateApplication({ ...ok, planId: draft.id })).toContain('plan_not_accepting');
  });

  it('存在しないプランは通さない', () => {
    expect(validateApplication({ ...ok, planId: 'no-such-plan' })).toContain('plan_not_found');
  });

  it('氏名が空なら通さない（空白だけも空とみなす）', () => {
    expect(validateApplication({ ...ok, name: '   ' })).toContain('name_required');
  });

  it('メールの形が違えば通さない', () => {
    for (const bad of ['', 'a', 'a@', '@b.co', 'a b@c.co', 'a@b']) {
      expect(validateApplication({ ...ok, email: bad }), bad).toContain('email_invalid');
    }
  });

  it('**同意が無ければ通さない**', () => {
    expect(validateApplication({ ...ok, consentChecked: false })).toContain('consent_required');
  });

  it('全エラーに ja/zh の文言がある', () => {
    for (const [key, msg] of Object.entries(VALIDATION_MESSAGE)) {
      expect(msg.ja.length, key).toBeGreaterThan(0);
      expect(msg.zh.length, key).toBeGreaterThan(0);
    }
  });
});

describe('申込の状態', () => {
  it('5つだけ（契約・決済の状態は持たない）', () => {
    expect(APPLICATION_STATUSES).toEqual(
      ['submitted', 'contacted', 'accepted', 'declined', 'cancelled'],
    );
  });
});
