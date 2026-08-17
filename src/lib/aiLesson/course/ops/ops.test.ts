// 監視・support の個人情報ガード（§16・§17）。送ってはいけないものを機械的に止める。
import { describe, it, expect } from 'vitest';
import {
  ERROR_SPECS, errorSpec, sanitizeEvent, reportError, reportEvent,
  createInMemoryMonitoring, FORBIDDEN_EVENT_KEYS, type ErrorCode, type MonitoringContext,
} from './errorCodes';
import {
  buildSupportPayload, validateSupportPayload, createUnsetSupportAdapter,
  SUPPORT_CATEGORY_LABEL, type SupportReport,
} from './supportReport';

const CTX: MonitoringContext = {
  route: '/ja/ai-course', feature: 'n3unit', locale: 'ja',
  appVersion: '1.0.0', contentVersion: '2026-07-29', deviceClass: 'mobile',
};
const NOW = 1_800_000_000_000;

describe('Error codes（§16）', () => {
  const REQUIRED: ErrorCode[] = ['AUTH_EXPIRED', 'ENTITLEMENT_DENIED', 'LOAD_FAILED', 'SAVE_FAILED',
    'SYNC_PENDING', 'SYNC_CONFLICT', 'RLS_DENIED', 'AI_UNAVAILABLE', 'MIC_DENIED',
    'REALTIME_DISCONNECTED', 'CONTENT_UNAVAILABLE', 'IMAGE_FAILED', 'STATE_CORRUPTED',
    'SCHEMA_NEWER', 'RATE_LIMITED', 'UNKNOWN'];

  it('16種すべてが定義され、learner向け文言と安全な次の行動を持つ', () => {
    for (const code of REQUIRED) {
      const s = ERROR_SPECS[code];
      expect(s, `${code} が未定義`).toBeTruthy();
      expect(s.userMessageJa.length).toBeGreaterThan(3);
      expect(s.userMessageZh.length).toBeGreaterThan(1);
      expect(s.safeActionJa.length).toBeGreaterThan(3);
      expect(s.safeActionZh.length, `${code}: safeActionZh欠落`).toBeGreaterThan(1);
      expect(['info', 'warning', 'error', 'critical']).toContain(s.severity);
    }
    expect(Object.keys(ERROR_SPECS).length).toBe(REQUIRED.length);
  });
  it('learner向け文言に技術用語・英語コードを出さない', () => {
    const forbidden = [/[A-Z]{3,}_[A-Z]/, /error/i, /exception/i, /null/i, /undefined/i,
      /RLS/, /JWT/, /API/, /HTTP/, /50\d/, /40\d/];
    for (const s of Object.values(ERROR_SPECS)) {
      for (const re of forbidden) {
        expect(re.test(s.userMessageJa), `${s.code}: ${s.userMessageJa}`).toBe(false);
        expect(re.test(s.safeActionJa), `${s.code}: ${s.safeActionJa}`).toBe(false);
      }
    }
  });
  it('未知のcodeはUNKNOWNへ落ちる', () => {
    expect(errorSpec('NOPE' as ErrorCode).code).toBe('UNKNOWN');
  });
});

describe('監視イベントのPII遮断（§16）', () => {
  it('許可リスト外のキーは落ちる', () => {
    const ev = sanitizeEvent({
      eventName: 'error', route: '/x', feature: 'f', locale: 'ja',
      appVersion: '1', contentVersion: '1', deviceClass: 'mobile', occurredAtMs: NOW,
      email: 'a@b.com', transcript: '会話全文', token: 'eyJabc.def', freeText: '自由入力',
    });
    expect(ev).toBeTruthy();
    for (const k of FORBIDDEN_EVENT_KEYS) expect(Object.keys(ev!)).not.toContain(k);
  });
  it('値にJWTらしき文字列や長大な文字列が混ざったら送らない', () => {
    expect(sanitizeEvent({ eventName: 'e', route: 'eyJhbGciOi.' + 'a'.repeat(20), feature: 'f',
      locale: 'ja', appVersion: '1', contentVersion: '1', deviceClass: 'mobile', occurredAtMs: NOW })).toBeNull();
    expect(sanitizeEvent({ eventName: 'e', route: 'x'.repeat(300), feature: 'f',
      locale: 'ja', appVersion: '1', contentVersion: '1', deviceClass: 'mobile', occurredAtMs: NOW })).toBeNull();
  });
  it('report=falseのcodeは送信されない（ノイズ削減）', () => {
    const mon = createInMemoryMonitoring();
    expect(reportError(mon, 'SYNC_PENDING', CTX, NOW)).toBeNull();
    expect(reportError(mon, 'IMAGE_FAILED', CTX, NOW)).toBeNull();
    expect(reportError(mon, 'SAVE_FAILED', CTX, NOW)).toBeTruthy();
    expect(mon.events.length).toBe(1);
    expect(mon.events[0].code).toBe('SAVE_FAILED');
  });
  it('学習イベントも許可フィールドのみで送られる', () => {
    const mon = createInMemoryMonitoring();
    reportEvent(mon, 'unit_completed', CTX, NOW);
    expect(mon.events[0].eventName).toBe('unit_completed');
    expect(Object.keys(mon.events[0]).sort()).toEqual(
      ['appVersion', 'contentVersion', 'deviceClass', 'eventName', 'feature', 'locale', 'occurredAtMs', 'route'].sort());
  });
});

describe('Support報告（§17）', () => {
  const report: SupportReport = {
    category: 'answer_wrong',
    freeTextJa: 'この問題の正解が2つあるように見えます。メールは a@b.com です',
    context: { route: '/ja/ai-course', feature: 'n3unit', locale: 'ja', appVersion: '1.0.0',
      contentVersion: '2026-07-29', deviceClass: 'mobile', lastErrorCode: 'UNKNOWN', subjectId: 'aq-fi-sensei-contrast0' },
    createdAtMs: NOW,
  };

  it('6カテゴリすべてに日中の表示名がある', () => {
    expect(Object.keys(SUPPORT_CATEGORY_LABEL).length).toBe(6);
    for (const v of Object.values(SUPPORT_CATEGORY_LABEL)) {
      expect(v.ja.length).toBeGreaterThan(1);
      expect(v.zh.length).toBeGreaterThan(1);
    }
  });
  it('payloadに自由入力を含めない（既定）', () => {
    const p = buildSupportPayload(report);
    expect(p.freeTextIncluded).toBe(false);
    expect(JSON.stringify(p)).not.toContain('a@b.com');
    expect(JSON.stringify(p)).not.toContain('正解が2つ');
  });
  it('payloadは教材IDだけを持ち、本文・個人情報を持たない', () => {
    const v = validateSupportPayload(buildSupportPayload(report));
    expect(v.ok).toBe(true);
    const p = buildSupportPayload(report);
    expect(p.context.subjectId).toBe('aq-fi-sensei-contrast0');
  });
  it('禁止情報が混ざったpayloadは検査で落ちる', () => {
    const bad = { ...buildSupportPayload(report),
      context: { ...report.context, route: 'user@example.com' } };
    const v = validateSupportPayload(bad);
    expect(v.ok).toBe(false);
  });
  it('送信先未確定のadapterは成功と偽らない', async () => {
    const a = createUnsetSupportAdapter();
    const r = await a.send(buildSupportPayload(report));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe('SUPPORT_DESTINATION_UNSET');
    expect(a.queued.length).toBe(1); // 失われず端末に残る
  });
});
