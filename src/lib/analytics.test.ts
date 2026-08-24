// @vitest-environment jsdom
//
// 流入元計測（UTM / 旧 ?from=）と、成果イベントの二重送信よけの回帰テスト。
// analytics.ts はモジュール読み込み時に env を読むため、テストごとに resetModules して読み直す。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Analytics = typeof import('./analytics');

/** 指定URLで開いた状態を作って analytics を読み直す */
const loadAt = async (url: string, env: Record<string, string> = {}): Promise<Analytics> => {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  window.history.replaceState({}, '', url);
  vi.resetModules();
  return await import('./analytics');
};

const savedUtm = () => JSON.parse(sessionStorage.getItem('kb_utm') ?? 'null');

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  delete (window as { gtag?: unknown }).gtag;
  delete (window as { fbq?: unknown }).fbq;
  delete (window as { _fbq?: unknown })._fbq;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('旧 ?from= → 標準UTM の読み替え（配布済みリンクの後方互換）', () => {
  it('?from=line を utm_source=line / utm_medium=share として保存する', async () => {
    const a = await loadAt('/ja/tournaments/1?from=line');
    a.initAnalytics();
    expect(savedUtm()).toEqual({ utm_source: 'line', utm_medium: 'share', utm_campaign: 'legacy_from' });
  });

  it('?from=wechat を utm_source=wechat として保存する', async () => {
    const a = await loadAt('/zh/tournaments/1?from=wechat');
    a.initAnalytics();
    expect(savedUtm()?.utm_source).toBe('wechat');
  });

  it('?from=web は流入元ではないので何も保存しない', async () => {
    const a = await loadAt('/ja/tournaments/1?from=web');
    a.initAnalytics();
    expect(savedUtm()).toBeNull();
  });

  it('知らない ?from= の値は保存しない（勝手な流入元を作らない）', async () => {
    const a = await loadAt('/ja/?from=%3Cscript%3E');
    a.initAnalytics();
    expect(savedUtm()).toBeNull();
  });

  it('utm_source と ?from= が両方あるときは utm_source を優先する', async () => {
    const a = await loadAt('/ja/?utm_source=google&utm_medium=cpc&from=line');
    a.initAnalytics();
    expect(savedUtm()).toEqual({ utm_source: 'google', utm_medium: 'cpc' });
  });

  it('セッションに保持済みのUTMを、あとから来た ?from= で上書きしない', async () => {
    sessionStorage.setItem('kb_utm', JSON.stringify({ utm_source: 'google', utm_medium: 'cpc' }));
    const a = await loadAt('/ja/?from=line');
    a.initAnalytics();
    expect(savedUtm()?.utm_source).toBe('google');
  });

  it('utmFromLegacyFromParam は単体でも同じ表を返す', async () => {
    const a = await loadAt('/ja/');
    expect(a.utmFromLegacyFromParam('LINE')?.utm_source).toBe('line');
    expect(a.utmFromLegacyFromParam('web')).toBeNull();
    expect(a.utmFromLegacyFromParam(null)).toBeNull();
  });

  it('新しいシェアリンクは標準UTMを付ける', async () => {
    const a = await loadAt('/ja/');
    expect(a.shareUtmQuery('line')).toBe('utm_source=line&utm_medium=share&utm_campaign=tournament_share');
    expect(a.shareUtmQuery('wechat')).toContain('utm_source=wechat');
  });
});

describe('DBに保存する流入元（entries.source / activity_entries.source と同じ3値）', () => {
  it('未知の値は3値に含めない', async () => {
    const a = await loadAt('/ja/');
    expect(a.normalizeTrafficSource('line')).toBe('line');
    expect(a.normalizeTrafficSource('WeChat')).toBe('wechat');
    expect(a.normalizeTrafficSource('weixin')).toBe('wechat');
    expect(a.normalizeTrafficSource('google')).toBeNull();
    expect(a.normalizeTrafficSource('')).toBeNull();
  });

  it('?from= が最優先', async () => {
    const a = await loadAt('/ja/tournaments/1?from=line');
    expect(a.getTrafficSource()).toBe('line');
  });

  it('?utm_source= からも取れる', async () => {
    const a = await loadAt('/ja/tournaments/1?utm_source=wechat&utm_medium=share');
    expect(a.getTrafficSource()).toBe('wechat');
  });

  it('SPA遷移でURLからパラメータが消えても、保持中のUTMから復元する', async () => {
    const a = await loadAt('/ja/tournaments/1?from=line');
    a.initAnalytics();
    // 一覧→詳細と動いてクエリが消えた状態
    window.history.replaceState({}, '', '/ja/tournaments/1');
    expect(a.getTrafficSource()).toBe('line');
  });

  it('何も無ければ web', async () => {
    const a = await loadAt('/ja/tournaments/1');
    expect(a.getTrafficSource()).toBe('web');
  });

  it('広告など3値に無い流入は web に落とす（DBは3値のまま保つ）', async () => {
    const a = await loadAt('/ja/?utm_source=google&utm_medium=cpc');
    expect(a.getTrafficSource()).toBe('web');
  });
});

describe('二重送信よけ（createOnceGate）', () => {
  it('同じキーは初回だけ通す', async () => {
    const a = await loadAt('/ja/');
    const gate = a.createOnceGate();
    expect(gate('purchase')).toBe(true);
    expect(gate('purchase')).toBe(false);
    expect(gate('purchase')).toBe(false);
  });

  it('キーが違えば独立している', async () => {
    const a = await loadAt('/ja/');
    const gate = a.createOnceGate();
    expect(gate('generate_lead')).toBe(true);
    expect(gate('begin_checkout')).toBe(true);
    expect(gate('generate_lead')).toBe(false);
  });

  it('申込ごとに別のゲートを作れば互いに影響しない', async () => {
    const a = await loadAt('/ja/');
    const first = a.createOnceGate();
    const second = a.createOnceGate();
    expect(first('purchase')).toBe(true);
    expect(second('purchase')).toBe(true);
  });
});

// ここから先は「実際に送信される」ところまで確認する。
// 本番ホストでないので ?tracktest=1 で計測を有効化し、gtag/fbq をスパイに差し替える
const enableTracking = async (url: string) => {
  const a = await loadAt(url, { VITE_GA4_ID: 'G-TEST', VITE_META_PIXEL_ID: '1234567890' });
  a.initAnalytics();
  const gtag = vi.fn();
  const fbq = vi.fn();
  (window as unknown as { gtag: unknown }).gtag = gtag;
  (window as unknown as { fbq: unknown }).fbq = fbq;
  return { a, gtag, fbq };
};

describe('page_view の参照元（SPA内部遷移で流入元が消える問題）', () => {
  it('2ページ目の page_view に直前のページが page_referrer として入る', async () => {
    const { a, gtag } = await enableTracking('/ja/tournaments/1?tracktest=1');

    a.trackPageView('/ja/tournaments/1');
    const first = gtag.mock.calls.find(c => c[1] === 'page_view')?.[2];
    // 初回は外部からの参照元のみ（jsdom では document.referrer が空 → 付かない）
    expect(first.page_referrer).toBeUndefined();

    window.history.replaceState({}, '', '/ja/faq');
    a.trackPageView('/ja/faq');
    const second = gtag.mock.calls.filter(c => c[1] === 'page_view')[1]?.[2];
    expect(second.page_path).toBe('/ja/faq');
    expect(second.page_referrer).toContain('/ja/tournaments/1');
  });

  it('参照元からも session_id 等の「鍵」は落とす', async () => {
    const { a, gtag } = await enableTracking('/ja/thanks?tracktest=1&session_id=cs_secret');

    a.trackPageView('/ja/thanks');
    window.history.replaceState({}, '', '/ja/');
    a.trackPageView('/ja/');

    const second = gtag.mock.calls.filter(c => c[1] === 'page_view')[1]?.[2];
    expect(second.page_referrer).not.toContain('cs_secret');
  });

  it('管理画面を開いたブラウザは以後計測しない（既存の除外を壊さない）', async () => {
    const { a, gtag } = await enableTracking('/ja/?tracktest=1');
    a.trackPageView('/admin');
    expect(gtag).not.toHaveBeenCalled();
    expect(localStorage.getItem('kb_notrack')).toBe('1');
    a.trackPageView('/ja/');
    expect(gtag).not.toHaveBeenCalled();
  });

  it('?notrack=1 のブラウザには何も送らない（既存の除外を壊さない）', async () => {
    const { a, gtag, fbq } = await enableTracking('/ja/?tracktest=1&notrack=1');
    a.trackPageView('/ja/');
    a.trackGenerateLead(1, 1500, 'confirmed');
    expect(gtag).not.toHaveBeenCalled();
    expect(fbq).not.toHaveBeenCalled();
  });
});

describe('成果イベントは GA4 と Meta の両方へ飛ぶ', () => {
  it('generate_lead → GA4 generate_lead ＋ Meta Lead。保持中のUTMも載る', async () => {
    const { a, gtag, fbq } = await enableTracking('/ja/tournaments/1?tracktest=1&from=line');

    a.trackGenerateLead(7, 1500, 'confirmed');

    const ga = gtag.mock.calls.find(c => c[1] === 'generate_lead');
    expect(ga?.[2]).toMatchObject({
      tournament_id: 7, value: 1500, currency: 'JPY', entry_status: 'confirmed', utm_source: 'line',
    });
    expect(fbq).toHaveBeenCalledWith('track', 'Lead', expect.objectContaining({ value: 1500 }));
  });

  it('begin_checkout / purchase も両方へ飛ぶ', async () => {
    const { a, gtag, fbq } = await enableTracking('/ja/tournaments/1?tracktest=1');

    a.trackBeginCheckout(7, 1500);
    a.trackPurchase(7, 1500);

    expect(gtag.mock.calls.some(c => c[1] === 'begin_checkout')).toBe(true);
    expect(gtag.mock.calls.some(c => c[1] === 'purchase')).toBe(true);
    expect(fbq).toHaveBeenCalledWith('track', 'InitiateCheckout', expect.anything());
    expect(fbq).toHaveBeenCalledWith('track', 'Purchase', expect.anything());
  });
});

describe('フッターの関連サービスのクリック', () => {
  it('どのページから・どの言語で・どのサービスへ出たかが残る', async () => {
    const { a, gtag } = await enableTracking('/zh/faq?tracktest=1');

    a.trackRelatedServiceClick('wildflow', '/zh/faq');

    const call = gtag.mock.calls.find(c => c[1] === 'click_related_service');
    expect(call?.[2]).toMatchObject({ service: 'wildflow', from_path: '/zh/faq', page_lang: 'zh' });
  });
});
