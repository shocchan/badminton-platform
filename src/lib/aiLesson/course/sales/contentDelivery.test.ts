import { describe, it, expect } from 'vitest';
import {
  decideDelivery, buildDeliveredStep, buildNextStepToken, parseNextStepToken,
  isRateLimited, MAX_STEP_INDEX, MAX_ITEMS_PER_REQUEST, RATE_LIMIT_MAX_IN_WINDOW,
  type ContentRequest, type DeliveryContext,
} from './contentDelivery';
import { createTrialGrant, activateTrial } from './trialActivation';
import { salesPlanById } from './planConfig';
import { FORBIDDEN_LEARNER_FIELDS, type InternalItem } from './contentGuard';

const plan = salesPlanById('ai-hour-pass')!;
const T0 = Date.UTC(2026, 7, 3, 12, 0);
const HOUR = 3_600_000;

const activeTrial = () =>
  activateTrial(
    createTrialGrant({ id: 'g1', learnerId: 'u1', purchaseId: 'p1', plan, purchasedAtMs: T0 }),
    plan, T0,
  ).grant!;

const req = (over: Partial<ContentRequest> = {}): ContentRequest => ({
  userId: 'u1', role: 'learner', kind: 'grammar',
  stageId: 'stage-1', stepIndex: 0, count: 3, sessionId: 's1',
  ...over,
});

const ctx = (over: Partial<DeliveryContext> = {}): DeliveryContext => ({
  trial: activeTrial(),
  consumedActiveSeconds: 0,
  hasPeriodAccess: false,
  stageState: 'current',
  sessionOwnerId: 'u1',
  serverNowMs: T0 + HOUR,
  ...over,
});

describe('認証と利用権が無ければ教材を渡さない（§8 §14）', () => {
  it('未認証は拒否', () => {
    expect(decideDelivery(req({ userId: null }), ctx()).denial).toBe('unauthenticated');
  });

  it('利用権が無ければ拒否', () => {
    expect(decideDelivery(req(), ctx({ trial: null, hasPeriodAccess: false })).denial).toBe('no_entitlement');
  });

  it('開始前の体験パスでは渡さない（購入しただけでは取れない）', () => {
    const unstarted = createTrialGrant({ id: 'g', learnerId: 'u1', purchaseId: 'p', plan, purchasedAtMs: T0 });
    expect(decideDelivery(req(), ctx({ trial: unstarted })).denial).toBe('trial_not_started');
  });

  it('24時間を過ぎたら新しい教材を渡さない（§5）', () => {
    expect(decideDelivery(req(), ctx({ serverNowMs: T0 + 25 * HOUR })).denial).toBe('trial_expired');
  });

  it('使い切ったら渡さない', () => {
    expect(decideDelivery(req(), ctx({ consumedActiveSeconds: 3600 })).denial).toBe('trial_consumed');
  });

  it('期間制プラン（1か月・6か月）なら時間制が無くても通る', () => {
    expect(decideDelivery(req(), ctx({ trial: null, hasPeriodAccess: true })).allowed).toBe(true);
  });

  it('判断の順番が「利用権 → ステージ」である（利用権なしにステージ構成を教えない）', () => {
    // 鍵付きステージを、利用権が無い状態で要求する
    const d = decideDelivery(req(), ctx({ trial: null, stageState: 'locked' }));
    expect(d.denial, 'stage_locked を先に返すと、鍵の有無という情報を漏らす').toBe('no_entitlement');
  });
});

describe('鍵付きステージの本文は渡さない（§6）', () => {
  it('locked は拒否', () => {
    expect(decideDelivery(req(), ctx({ stageState: 'locked' })).denial).toBe('stage_locked');
  });

  it('completed / current / available は通る', () => {
    for (const s of ['completed', 'current', 'available'] as const) {
      expect(decideDelivery(req(), ctx({ stageState: s })).allowed, s).toBe(true);
    }
  });

  it('URLでステージIDを直接指定しても、locked なら通らない', () => {
    const d = decideDelivery(req({ stageId: 'stage-99' }), ctx({ stageState: 'locked' }));
    expect(d.allowed).toBe(false);
  });
});

describe('他人のセッションでは取れない（§14 D）', () => {
  it('セッションの持ち主が違えば拒否', () => {
    expect(decideDelivery(req({ userId: 'u1' }), ctx({ sessionOwnerId: 'u2' })).denial).toBe('session_not_owned');
  });

  it('持ち主が不明なセッションも拒否', () => {
    expect(decideDelivery(req(), ctx({ sessionOwnerId: null })).denial).toBe('session_not_owned');
  });
});

describe('管理者QAと学習者の経路を分ける（§8）', () => {
  it('学習者エンドポイントに admin_qa で来ても通さない', () => {
    expect(decideDelivery(req({ role: 'admin_qa' }), ctx()).allowed).toBe(false);
  });
});

describe('順番に叩いて全件取得できない（§8）', () => {
  it('stepIndex に上限がある', () => {
    expect(decideDelivery(req({ stepIndex: MAX_STEP_INDEX + 1 }), ctx()).denial).toBe('step_out_of_range');
  });

  it('負の値や小数は拒否', () => {
    expect(decideDelivery(req({ stepIndex: -1 }), ctx()).denial).toBe('step_out_of_range');
    expect(decideDelivery(req({ stepIndex: 1.5 }), ctx()).denial).toBe('step_out_of_range');
  });

  it('1回の件数は上限で丸める（エラーにしない）', () => {
    // エラーにすると通常利用者が制限表示を頻繁に見ることになる
    const d = decideDelivery(req({ count: 9999 }), ctx());
    expect(d.allowed).toBe(true);
    expect(d.count).toBe(MAX_ITEMS_PER_REQUEST);
  });

  it('上限×step上限でも、バンク全体には届かない量に収まる', () => {
    const maxReachable = (MAX_STEP_INDEX + 1) * MAX_ITEMS_PER_REQUEST;
    expect(maxReachable).toBeLessThan(1000); // 1万問以上のbankに対して十分小さい
  });
});

describe('返す中身に内部情報を入れない（§7 §8）', () => {
  // わざと内部IDつきのオブジェクト選択肢を混ぜる。
  // 型は string[] だが、バンク側がこの形を持っていても漏らさないことを確かめる
  const internal: InternalItem[] = [{
    id: 'n2g-003', bankIndex: 12, sourceFile: 'n2GrammarDrafts.ts',
    internalNotes: 'レビュー保留', prompt: '問題文',
    choices: [{ id: 'n2g-003-c1', textJa: 'A' }, { id: 'n2g-003-c2', textJa: 'B' }],
    correctChoiceId: '0', explanationJa: '解説', explanationZh: '说明',
  } as unknown as InternalItem];

  it('内部ID・sourceFile・監査欄が出ない', () => {
    const step = buildDeliveredStep(req(), internal, 1);
    const json = JSON.stringify(step);
    for (const f of FORBIDDEN_LEARNER_FIELDS) {
      expect(json.includes(`"${f}"`), `${f} が漏れている`).toBe(false);
    }
    expect(json.includes('n2g-003'), '正準IDが漏れている').toBe(false);
    expect(buildDeliveredStep(req(), internal, 1).items[0].choices).toEqual(['A', 'B']);
    expect(json.includes('n2GrammarDrafts.ts')).toBe(false);
  });

  it('許可された件数しか入らない', () => {
    const many = Array.from({ length: 20 }, () => internal[0]);
    expect(buildDeliveredStep(req(), many, 3).items.length).toBe(3);
  });
});

describe('次stepのtokenは推測・改ざんできない', () => {
  const secret = 'test-secret';
  // テスト用の決定的な署名。実装は worker 側で HMAC を使う
  const sign = async (payload: string, s: string) => {
    let h = 0;
    for (const ch of payload + s) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return Math.abs(h).toString(36).padStart(12, '0');
  };

  it('作って読み戻せる', async () => {
    const tok = await buildNextStepToken(
      { userId: 'u1', sessionId: 's1', stageId: 'stage-1', nextStepIndex: 1 }, secret, sign,
    );
    const parsed = await parseNextStepToken(tok!, secret, sign);
    expect(parsed?.nextStepIndex).toBe(1);
    expect(parsed?.userId).toBe('u1');
  });

  it('中身を書き換えると通らない', async () => {
    const tok = await buildNextStepToken(
      { userId: 'u1', sessionId: 's1', stageId: 'stage-1', nextStepIndex: 1 }, secret, sign,
    );
    // payload だけ差し替える（stepIndex を進める試み）
    const [, sig] = tok!.split('.');
    const forgedPayload = btoa(JSON.stringify({
      userId: 'u1', sessionId: 's1', stageId: 'stage-1', nextStepIndex: 39,
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await parseNextStepToken(`${forgedPayload}.${sig}`, secret, sign)).toBeNull();
  });

  it('別の鍵で作ったtokenは通らない', async () => {
    const tok = await buildNextStepToken(
      { userId: 'u1', sessionId: 's1', stageId: 'stage-1', nextStepIndex: 1 }, 'other-secret', sign,
    );
    expect(await parseNextStepToken(tok!, secret, sign)).toBeNull();
  });

  it('壊れた token は落ちずに null', async () => {
    for (const bad of ['', 'no-dot', 'a.b', '....']) {
      expect(await parseNextStepToken(bad, secret, sign)).toBeNull();
    }
  });

  it('上限を超えるstepのtokenは作らない', async () => {
    expect(await buildNextStepToken(
      { userId: 'u1', sessionId: 's1', stageId: 'stage-1', nextStepIndex: MAX_STEP_INDEX + 1 },
      secret, sign,
    )).toBeNull();
  });
});

describe('連打は止めるが、普通の学習は止めない（§8 §14 E）', () => {
  it('1分に40回を超えると止める', () => {
    const many = Array.from({ length: RATE_LIMIT_MAX_IN_WINDOW }, (_, i) => T0 + i * 100);
    expect(isRateLimited({ recentRequestMs: many }, T0 + 5_000)).toBe(true);
  });

  it('60分ぶん真面目に解いても止まらない', () => {
    // 1問あたり20秒として60分＝180問。1分あたり3回程度で上限に当たらない
    const realistic: number[] = [];
    for (let i = 0; i < 180; i++) realistic.push(T0 + i * 20_000);
    const worst = Math.max(
      ...realistic.map((t) => isRateLimited({ recentRequestMs: realistic }, t) ? 1 : 0),
    );
    expect(worst, '通常の学習ペースで制限に当たってはいけない').toBe(0);
  });

  it('窓の外の記録は数えない', () => {
    const old = Array.from({ length: 100 }, (_, i) => T0 - 120_000 + i);
    expect(isRateLimited({ recentRequestMs: old }, T0)).toBe(false);
  });
});
