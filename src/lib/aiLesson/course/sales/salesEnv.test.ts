// 決済モード判定の受入テスト。
//
// 依頼書の絶対条件「production deploy・本番決済は行わない」を、
// 運用の約束ではなく**コードの分岐**で守れているかを固定する。

import { describe, it, expect } from 'vitest';
import {
  resolveCheckoutMode, checkoutNotice, assertCheckoutAllowed, ALLOW_LIVE_CHECKOUT,
} from './salesEnv';

describe('鍵の種類で決済モードが決まる', () => {
  it('test鍵のときだけ決済が動く', () => {
    expect(resolveCheckoutMode('pk_test_51AbCdEf')).toBe('test');
  });

  it('本番鍵では決済が無効（CEO承認フラグが false のあいだ）', () => {
    expect(resolveCheckoutMode('pk_live_51AbCdEf')).toBe('disabled');
  });

  it('鍵が無ければ決済は無効', () => {
    expect(resolveCheckoutMode('')).toBe('disabled');
    expect(resolveCheckoutMode('   ')).toBe('disabled');
  });

  it('見慣れない形の値でも決済を開けない（未知はすべて無効側へ倒す）', () => {
    for (const k of ['sk_test_x', 'pk_', 'test', 'PK_TEST_X', 'pk_testx']) {
      expect(resolveCheckoutMode(k), k).toBe('disabled');
    }
  });

  it('本番決済の許可フラグは既定で false（勝手に有効化されない）', () => {
    expect(ALLOW_LIVE_CHECKOUT).toBe(false);
  });

  it('許可フラグを立てたときだけ live になる', () => {
    expect(resolveCheckoutMode('pk_live_x', true)).toBe('live');
  });
});

describe('最終ガード', () => {
  it('無効モードでは決済処理を通さない', () => {
    expect(() => assertCheckoutAllowed('disabled')).toThrow('checkout_disabled');
  });

  it('未承認の本番決済は例外にする（二重の歯止め）', () => {
    // ALLOW_LIVE_CHECKOUT が false のあいだは、live モードが渡ってきても通さない
    expect(() => assertCheckoutAllowed('live')).toThrow('live_checkout_not_approved');
  });

  it('test は通る', () => {
    expect(() => assertCheckoutAllowed('test')).not.toThrow();
  });
});

describe('利用者への説明', () => {
  it('テスト環境であることを隠さず、本物のカードを入れないよう伝える', () => {
    expect(checkoutNotice('test', 'ja')).toContain('テスト環境');
    expect(checkoutNotice('test', 'ja')).toContain('本物のカード情報は入力しないでください');
    expect(checkoutNotice('test', 'zh')).toContain('测试环境');
  });

  it('決済が使えないときは、代わりに何ができるかを言う（行き止まりにしない）', () => {
    expect(checkoutNotice('disabled', 'ja')).toContain('お申し込み');
    expect(checkoutNotice('disabled', 'zh')).toContain('申请');
  });

  it('live のときは注意書きを出さない', () => {
    expect(checkoutNotice('live', 'ja')).toBeNull();
  });
});
