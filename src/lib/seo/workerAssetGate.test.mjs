// @vitest-environment node
//
// 有料教材assetの門。**生成されたWorkerの fetch を実際に呼んで**確認する。
//
// 【なぜ要るか】
// 2026-08-24 の本番実測:
//   curl https://kawabado.com/assets/ai-course-vocab-content-DGYtQC-c.js
//     → HTTP 200 / 2,080,346 bytes / Cache-Control: public, max-age=31536000, immutable
// 読解・聴解と合わせて約3.2MB。¥600 / ¥2,980 / ¥100,000 で売っている商品の中身が、
// URLを叩くだけで誰でも全量ダウンロードできる状態だった。
//
// 【このテストがいちばん守りたいこと】
// 門そのものではなく「**門が既定でOFFであること**」と「**教材以外のassetを巻き込まないこと**」。
// 本番には実生徒がいる。門の設定ミスで学習が止まるほうが、露出が続くより取り返しがつかない。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildWorkerSource } from '../../../scripts/generate-worker.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const INDEX_HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

let W;

beforeAll(async () => {
  const source = buildWorkerSource(INDEX_HTML)
    + '\nexport { signCoursePass, verifyCoursePass, GATED_ASSET_PREFIXES, COURSE_PASS_TTL_MS };\n';
  const url = 'data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64');
  W = await import(/* @vite-ignore */ url);
});

const SECRET = 'test-secret-do-not-use-in-production';
const VOCAB = '/assets/ai-course-vocab-content-DGYtQC-c.js';
const READING = '/assets/ai-course-reading-C6ziCjk1.js';
const LISTENING = '/assets/ai-course-listening-CvzQV-xE.js';
const APP_BUNDLE = '/assets/index-DnQ4U3dQ.js';

/** env.ASSETS のスタブ。何を要求されたかを記録し、教材なら「本物っぽいJS」を返す */
function makeEnv(extra = {}) {
  const served = [];
  return {
    served,
    env: {
      VITE_SUPABASE_URL: 'https://stub.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'stub-key',
      ASSETS: {
        fetch: async (req) => {
          const p = new URL(typeof req === 'string' ? req : req.url).pathname;
          served.push(p);
          return new Response('export const X=1;', {
            status: 200,
            headers: { 'Content-Type': 'application/javascript' },
          });
        },
      },
      ...extra,
    },
  };
}

const get = (env, path, headers = {}) =>
  W.default.fetch(new Request('https://kawabado.com' + path, { headers }), env);

describe('門が既定でOFFである（本番の挙動を1バイトも変えない）', () => {
  it('環境変数を何も設定しなければ、教材assetは今までどおり200で返る', async () => {
    const { env, served } = makeEnv();
    for (const p of [VOCAB, READING, LISTENING]) {
      const res = await get(env, p);
      expect(res.status, p + ' が200で返らない').toBe(200);
    }
    expect(served).toEqual([VOCAB, READING, LISTENING]);
  });

  it('**鍵だけ設定してもONにはならない**（明示的に on と書くまで門は閉じない）', async () => {
    const { env } = makeEnv({ AI_COURSE_ASSET_GATE_SECRET: SECRET });
    expect((await get(env, VOCAB)).status).toBe(200);
  });

  it('**ONにしても鍵が無ければ素通しする**（フェイルオープン）', async () => {
    const { env } = makeEnv({ AI_COURSE_ASSET_GATE: 'on' });
    expect((await get(env, VOCAB)).status).toBe(200);
  });

  it("'on' 以外の値（true / 1 / ON）では閉じない", async () => {
    for (const v of ['true', '1', 'ON', 'yes', '']) {
      const { env } = makeEnv({ AI_COURSE_ASSET_GATE: v, AI_COURSE_ASSET_GATE_SECRET: SECRET });
      expect((await get(env, VOCAB)).status, 'AI_COURSE_ASSET_GATE=' + v).toBe(200);
    }
  });
});

describe('門がONのとき', () => {
  const onEnv = (extra = {}) =>
    makeEnv({ AI_COURSE_ASSET_GATE: 'on', AI_COURSE_ASSET_GATE_SECRET: SECRET, ...extra });

  it('通行証が無ければ403（200で空を返さない＝壊れ方を分かりやすくする）', async () => {
    const { env, served } = onEnv();
    const res = await get(env, VOCAB);
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(served, '403なのにassetを取りに行っている').toEqual([]);
  });

  it('有効な通行証があれば200', async () => {
    const { env } = onEnv();
    const token = await W.signCoursePass('user-1', Date.now() + 60_000, SECRET);
    const res = await get(env, VOCAB, { Cookie: 'kb_course_pass=' + token });
    expect(res.status).toBe(200);
  });

  it('他のCookieが混ざっていても通行証を拾える', async () => {
    const { env } = onEnv();
    const token = await W.signCoursePass('user-1', Date.now() + 60_000, SECRET);
    const res = await get(env, VOCAB, { Cookie: 'foo=bar; kb_course_pass=' + token + '; baz=qux' });
    expect(res.status).toBe(200);
  });

  it('署名を改竄した通行証は拒否される', async () => {
    const { env } = onEnv();
    const token = await W.signCoursePass('user-1', Date.now() + 60_000, SECRET);
    const [payload, sig] = token.split('.');
    const tampered = payload + '.' + (sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A'));
    expect((await get(env, VOCAB, { Cookie: 'kb_course_pass=' + tampered })).status).toBe(403);
  });

  it('**中身を書き換えて期限を延ばした通行証は拒否される**（署名が payload を覆っている）', async () => {
    const { env } = onEnv();
    const token = await W.signCoursePass('user-1', Date.now() + 60_000, SECRET);
    const sig = token.split('.')[1];
    const forged = Buffer.from('user-1|' + (Date.now() + 999_999_999))
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect((await get(env, VOCAB, { Cookie: 'kb_course_pass=' + forged + '.' + sig })).status).toBe(403);
  });

  it('期限切れの通行証は拒否される', async () => {
    const { env } = onEnv();
    const token = await W.signCoursePass('user-1', Date.now() - 1000, SECRET);
    expect((await get(env, VOCAB, { Cookie: 'kb_course_pass=' + token })).status).toBe(403);
  });

  it('別の鍵で署名された通行証は拒否される', async () => {
    const { env } = onEnv();
    const token = await W.signCoursePass('user-1', Date.now() + 60_000, 'someone-elses-secret');
    expect((await get(env, VOCAB, { Cookie: 'kb_course_pass=' + token })).status).toBe(403);
  });

  it('壊れたCookie値でも例外にならず403になる', async () => {
    const { env } = onEnv();
    for (const v of ['', 'x', 'a.b.c', '....', '%%%.%%%', 'not-base64!.sig']) {
      const res = await get(env, VOCAB, { Cookie: 'kb_course_pass=' + v });
      expect(res.status, 'Cookie=' + v).toBe(403);
    }
  });

  it('🚨 教材以外のassetは門の対象外（サイト全体を壊さないための守り）', async () => {
    const { env } = onEnv();
    for (const p of [APP_BUNDLE, '/assets/index-BPOJXdaT.css', '/favicon.svg', '/ogp.jpg']) {
      expect((await get(env, p)).status, p + ' が門に巻き込まれている').toBe(200);
    }
  });

  it('🚨 HTMLページは門の対象外（トップも大会詳細も開ける）', async () => {
    const { env } = onEnv();
    for (const p of ['/', '/ja/', '/ja/faq', '/ja/ai-course']) {
      expect((await get(env, p)).status, p).toBe(200);
    }
  });

  it('教材3種すべてが対象に入っている（1つでも漏れたら意味がない）', () => {
    expect(W.GATED_ASSET_PREFIXES).toEqual([
      '/assets/ai-course-vocab-content-',
      '/assets/ai-course-reading-',
      '/assets/ai-course-listening-',
    ]);
    for (const p of [VOCAB, READING, LISTENING]) {
      expect(W.GATED_ASSET_PREFIXES.some((x) => p.startsWith(x)), p).toBe(true);
    }
  });

  it('ハッシュを直書きしていない（ビルドごとに変わるため）', () => {
    for (const p of W.GATED_ASSET_PREFIXES) {
      expect(p, 'プレフィックスにハッシュらしき文字列が入っている').toMatch(/-$/);
    }
  });
});

describe('通行証の発行（POST /_course/pass）', () => {
  it('GET では 405', async () => {
    const { env } = makeEnv({ AI_COURSE_ASSET_GATE_SECRET: SECRET });
    expect((await get(env, '/_course/pass')).status).toBe(405);
  });

  it('鍵が未設定なら「門は無効」と返して素通しする（クライアントが失敗扱いしない）', async () => {
    const { env } = makeEnv();
    const res = await W.default.fetch(
      new Request('https://kawabado.com/_course/pass', { method: 'POST' }), env
    );
    expect(res.status).toBe(200);
    expect((await res.json()).gate).toBe('disabled');
  });

  it('Bearer が無ければ401', async () => {
    const { env } = makeEnv({ AI_COURSE_ASSET_GATE_SECRET: SECRET });
    const res = await W.default.fetch(
      new Request('https://kawabado.com/_course/pass', { method: 'POST' }), env
    );
    expect(res.status).toBe(401);
  });

  it('Supabase が拒否したトークンは401（Cookieを出さない）', async () => {
    const { env } = makeEnv({ AI_COURSE_ASSET_GATE_SECRET: SECRET });
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response('bad jwt', { status: 401 });
    try {
      const res = await W.default.fetch(new Request('https://kawabado.com/_course/pass', {
        method: 'POST', headers: { Authorization: 'Bearer forged' },
      }), env);
      expect(res.status).toBe(401);
      expect(res.headers.get('Set-Cookie')).toBeNull();
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('Supabase に届かないときは503（利用者のせいにしない）', async () => {
    const { env } = makeEnv({ AI_COURSE_ASSET_GATE_SECRET: SECRET });
    const orig = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('network down'); };
    try {
      const res = await W.default.fetch(new Request('https://kawabado.com/_course/pass', {
        method: 'POST', headers: { Authorization: 'Bearer whatever' },
      }), env);
      expect(res.status).toBe(503);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('検証が通れば HttpOnly / Secure / SameSite=Lax の通行証を返し、それで門を通れる', async () => {
    const { env } = makeEnv({
      AI_COURSE_ASSET_GATE: 'on', AI_COURSE_ASSET_GATE_SECRET: SECRET,
    });
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ id: 'learner-42' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
    let cookie;
    try {
      const res = await W.default.fetch(new Request('https://kawabado.com/_course/pass', {
        method: 'POST', headers: { Authorization: 'Bearer good-token' },
      }), env);
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('Set-Cookie') || '';
      expect(setCookie).toMatch(/^kb_course_pass=/);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Path=/');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      cookie = setCookie.split(';')[0];
    } finally {
      globalThis.fetch = orig;
    }
    // 発行された通行証が実際に門を通ることを確認する（署名の自己整合）
    expect((await get(env, VOCAB, { Cookie: cookie })).status).toBe(200);
  });

  it('通行証の寿命は数時間（長すぎず・学習中に切れない）', () => {
    expect(W.COURSE_PASS_TTL_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(W.COURSE_PASS_TTL_MS).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});

describe('verifyCoursePass 単体', () => {
  it('鍵が空なら常に false（フェイルオープンは呼び出し側の責務）', async () => {
    const token = await W.signCoursePass('u', Date.now() + 1000, SECRET);
    expect(await W.verifyCoursePass('kb_course_pass=' + token, '')).toBe(false);
  });

  it('nowMs を渡せば時刻を固定して検証できる', async () => {
    const exp = 1_800_000_000_000;
    const token = await W.signCoursePass('u', exp, SECRET);
    expect(await W.verifyCoursePass('kb_course_pass=' + token, SECRET, exp - 1)).toBe(true);
    expect(await W.verifyCoursePass('kb_course_pass=' + token, SECRET, exp + 1)).toBe(false);
  });
});
