import { describe, it, expect } from 'vitest';
import { expiredAudienceOf, isTrialCompletion } from './expiredOffer';
import { PLAN_CATALOG, publishedPlans } from './planCatalog';

describe('expiredAudienceOf', () => {
  it('手動発行（plan_id が null）は coached＝先生に言うのがいちばん早い', () => {
    expect(expiredAudienceOf(null)).toBe('coached');
    expect(expiredAudienceOf(undefined)).toBe('coached');
    expect(expiredAudienceOf('')).toBe('coached');
  });

  it('自分で買った人は selfServe（**行き止まりにしない**のがこの分岐の目的）', () => {
    expect(expiredAudienceOf('ai-trial-pass')).toBe('selfServe');
    expect(expiredAudienceOf('ai-month')).toBe('selfServe');
  });

  it('Friends Beta（カタログに無い）も selfServe。先生と直接の接点がない', () => {
    expect(expiredAudienceOf('friends-beta')).toBe('selfServe');
    expect(expiredAudienceOf('whatever-new-plan')).toBe('selfServe');
  });

  it('人のレッスンを含むプランは coached（プラン名ではなく lessonCount から導く）', () => {
    expect(expiredAudienceOf('coach-6m')).toBe('coached');
    // 商品が増えても、この規則で自動的に正しい側へ入る
    for (const p of PLAN_CATALOG) {
      expect(expiredAudienceOf(p.id), p.id).toBe(p.lessonCount > 0 ? 'coached' : 'selfServe');
    }
  });
});

describe('isTrialCompletion', () => {
  it('体験パスだけ「完走」として迎える', () => {
    expect(isTrialCompletion('ai-trial-pass')).toBe(true);
    expect(isTrialCompletion('ai-month')).toBe(false);
    expect(isTrialCompletion(null)).toBe(false);
  });
});

describe('期限切れ画面に出せる選択肢', () => {
  /*
   * CEOの言う「1時間・1か月・特別コース」の3択。
   * 600円は 2026-08-26（体験パス v5）に**実時間60分から開始後7日間**へ変わっている。
   * ここが崩れたら文言も直す必要があるので、テストで気づけるようにしておく。
   */
  it('公開中は3つ。決済へ直行するのは2つ、6か月は相談（法的確認が終わるまで決済にしない）', () => {
    const plans = publishedPlans();
    expect(plans.map((p) => p.id)).toEqual(['ai-trial-pass', 'ai-month', 'coach-6m']);
    expect(plans.filter((p) => p.ctaMode === 'checkout').map((p) => p.id))
      .toEqual(['ai-trial-pass', 'ai-month']);
    expect(plans.find((p) => p.id === 'coach-6m')!.ctaMode).toBe('consult');
  });

  it('体験パスは「60分」ではなく日数制（文言と商品がずれない）', () => {
    const trial = publishedPlans().find((p) => p.id === 'ai-trial-pass')!;
    expect(trial.realtimeWindowMinutes).toBe(null);
    expect(trial.trialDays).toBe(7);
  });
});
