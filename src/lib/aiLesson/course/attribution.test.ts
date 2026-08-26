// 流入元の取り込み（2026-08-26 Phase S1）。
//
// ここで守るのは「広告費の判断に使える形で残ること」。
// いちばん壊れやすいのは **直接流入が first-touch を奪う** 事故で、
// そうなると「全部が直接流入」という、いまと同じ何も分からない状態に戻る。
import { describe, it, expect } from 'vitest';
import { readTouch, referrerHostOf, hasTouch, mergeTouch, type Touch } from './attribution';

const T = (p: Partial<Touch> = {}): Touch => ({
  source: null, medium: null, campaign: null, content: null, term: null,
  referrerHost: null, landingPath: '/zh/ai-course', atISO: '2026-08-26T00:00:00Z', ...p,
});

describe('URLから流入元を読む', () => {
  it('5つのUTMをすべて拾う', () => {
    const t = readTouch(
      '?utm_source=xhs&utm_medium=social&utm_campaign=aug&utm_content=card3&utm_term=n2',
      '', 'kawabado.com', '/zh/ai-course', '2026-08-26T00:00:00Z',
    );
    expect(t.source).toBe('xhs');
    expect(t.medium).toBe('social');
    expect(t.campaign).toBe('aug');
    expect(t.content).toBe('card3');
    expect(t.term).toBe('n2');
    expect(t.landingPath).toBe('/zh/ai-course');
  });

  it('空文字のUTMは無いものとして扱う', () => {
    const t = readTouch('?utm_source=&utm_medium=%20', '', 'kawabado.com', '/ja/ai-course', 'x');
    expect(t.source).toBeNull();
    expect(t.medium).toBeNull();
  });

  it('長すぎる値は120文字で切る（DBの上限に合わせる）', () => {
    const t = readTouch(`?utm_campaign=${'a'.repeat(300)}`, '', 'kawabado.com', '/', 'x');
    expect(t.campaign).toHaveLength(120);
  });
});

describe('referrer はホスト名だけ', () => {
  it('外部サイトはホスト名を取る', () => {
    expect(referrerHostOf('https://www.xiaohongshu.com/explore/abc?q=1', 'kawabado.com'))
      .toBe('www.xiaohongshu.com');
  });
  it('自サイト内の移動は流入ではない', () => {
    expect(referrerHostOf('https://kawabado.com/zh', 'kawabado.com')).toBeNull();
  });
  it('referrer が無ければ null', () => {
    expect(referrerHostOf('', 'kawabado.com')).toBeNull();
  });
  it('壊れたURLでも例外にしない', () => {
    expect(referrerHostOf('not a url', 'kawabado.com')).toBeNull();
  });
  it('パスやクエリは残さない（個人情報が混ざりうるため）', () => {
    const h = referrerHostOf('https://mail.example.com/inbox/token123', 'kawabado.com');
    expect(h).toBe('mail.example.com');
    expect(h).not.toContain('token123');
  });
});

describe('流入元と言えるか', () => {
  it('landingPath だけでは流入元とみなさない', () => {
    expect(hasTouch(T())).toBe(false);
  });
  it('referrer だけでも流入元', () => {
    expect(hasTouch(T({ referrerHost: 'weixin.qq.com' }))).toBe(true);
  });
  it('utm_content だけでも流入元', () => {
    expect(hasTouch(T({ content: 'card3' }))).toBe(true);
  });
});

describe('first-touch と last-touch', () => {
  it('初回の流入元が first になる', () => {
    const s = mergeTouch(null, T({ source: 'xhs' }));
    expect(s.first.source).toBe('xhs');
    expect(s.last.source).toBe('xhs');
  });

  it('2回目に別の流入元で来ても first は変わらない', () => {
    const s1 = mergeTouch(null, T({ source: 'xhs', campaign: 'aug' }));
    const s2 = mergeTouch(s1, T({ source: 'wechat', campaign: 'sep' }));
    expect(s2.first.source).toBe('xhs');
    expect(s2.first.campaign).toBe('aug');
    expect(s2.last.source).toBe('wechat');
    expect(s2.last.campaign).toBe('sep');
  });

  it('直接流入で戻ってきても last-touch を消さない', () => {
    const s1 = mergeTouch(null, T({ source: 'xhs' }));
    const s2 = mergeTouch(s1, T());   // UTMもreferrerも無い
    expect(s2.last.source).toBe('xhs');
  });

  it('直接流入で始まったあと広告から来たら、その広告が first になる', () => {
    // これが無いと「最初の直接流入」が全部の手柄を持ち、広告の効果が永久に見えない
    const s1 = mergeTouch(null, T());
    expect(hasTouch(s1.first)).toBe(false);
    const s2 = mergeTouch(s1, T({ source: 'meta', medium: 'cpc' }));
    expect(s2.first.source).toBe('meta');
    expect(s2.last.source).toBe('meta');
  });

  it('小紅書で知って WeChat で買う導線が両方残る', () => {
    const s1 = mergeTouch(null, T({ source: 'xhs', medium: 'social' }));
    const s2 = mergeTouch(s1, T({ referrerHost: 'weixin.qq.com' }));
    expect(s2.first.source).toBe('xhs');
    expect(s2.last.referrerHost).toBe('weixin.qq.com');
  });
});

describe('DBのホワイトリストと綴りが一致している', () => {
  it('FunnelKind の13種が migration の配列と同じ', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync('supabase/migrations/20260826140000_ai_funnel_attribution.sql', 'utf8');
    const src = readFileSync('src/lib/aiLesson/course/attribution.ts', 'utf8');
    const block = /v_kinds constant text\[\] := array\[([\s\S]*?)\];/.exec(sql);
    expect(block, 'migration の kind 配列が見つからない').toBeTruthy();
    const dbKinds = [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();

    const typeBlock = /export type FunnelKind =([\s\S]*?);/.exec(src);
    expect(typeBlock, 'FunnelKind が見つからない').toBeTruthy();
    const tsKinds = [...typeBlock![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();

    expect(tsKinds).toEqual(dbKinds);
    expect(dbKinds).toHaveLength(13);
  });
});
