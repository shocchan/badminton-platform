// @vitest-environment jsdom
// 先生別 realtime 音声ルーティングの機械保証（FINAL COMPLETION §5・§6・§20）。
//
// ここで固定したいこと:
// 1. voice の決定は**サーバー側（Edge Function）の allowlist だけ**で行われる
// 2. クライアントは teacherId しか送らない（任意 voice 文字列の注入経路を作らない）
// 3. 不正値・未指定は既定の先生（翔子先生 / marin）へ倒れる
// 4. クライアント側の写し（CANONICAL_TEACHER_VOICE）とサーバーの対応表が一致する
// 5. secrets をレスポンス・ログへ出さない
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CANONICAL_TEACHER_VOICE, ADV_TEACHER_IDS, ALL_TEACHERS, resolveTeacher, DEFAULT_TEACHER_ID,
} from './advTeacher';
import { startVoiceSession } from '../../voiceSession';

const EDGE_FN = resolve(process.cwd(), 'supabase/functions/ai-lesson-token/index.ts');
const edgeSource = readFileSync(EDGE_FN, 'utf8');

/** Edge Function の TEACHER_VOICE ブロックを実ソースから読み取る */
const serverMapping = (): Record<string, string> => {
  const block = edgeSource.match(/const TEACHER_VOICE = \{([\s\S]*?)\} as const;/);
  expect(block, 'Edge Function に TEACHER_VOICE allowlist が無い').toBeTruthy();
  const out: Record<string, string> = {};
  for (const m of block![1].matchAll(/(\w+)\s*:\s*"([^"]+)"/g)) out[m[1]] = m[2];
  return out;
};

describe('先生 → realtime音声 の allowlist（サーバー側が正）', () => {
  it('Edge Function に teacherId → voice の allowlist がある', () => {
    expect(serverMapping()).toEqual({ shoko: 'marin', yuto: 'cedar' });
  });

  it('クライアント側の写しとサーバーの対応表が一致する', () => {
    expect(CANONICAL_TEACHER_VOICE).toEqual(serverMapping());
  });

  it('レジストリの realtimeVoice も同じ値を指す（3か所がズレない）', () => {
    for (const t of ALL_TEACHERS) {
      expect(t.realtimeVoice).toBe(CANONICAL_TEACHER_VOICE[t.id]);
    }
  });

  it('全 teacherId に音声が割り当てられている（未割当の先生を作らない）', () => {
    for (const id of ADV_TEACHER_IDS) {
      expect(CANONICAL_TEACHER_VOICE[id]).toBeTruthy();
    }
  });

  it('先生ごとに異なる音声である（切り替えたのに同じ声、を防ぐ）', () => {
    const voices = ADV_TEACHER_IDS.map((id) => CANONICAL_TEACHER_VOICE[id]);
    expect(new Set(voices).size).toBe(voices.length);
  });

  it('Edge Function は不正な teacherId を既定の先生へ倒す', () => {
    // resolveTeacherId は「TEACHER_VOICE に存在する文字列」以外を DEFAULT_TEACHER へ倒す実装
    expect(edgeSource).toMatch(/const DEFAULT_TEACHER: TeacherId = "shoko"/);
    expect(edgeSource).toMatch(
      /resolveTeacherId = \(v: unknown\): TeacherId =>\s*\(typeof v === "string" && v in TEACHER_VOICE\)/,
    );
  });

  it('Edge Function はクライアントから voice 文字列を受け取らない', () => {
    // body.voice / plan.voice のような読み取りが存在しないこと
    expect(edgeSource).not.toMatch(/body\.voice/);
    expect(edgeSource).not.toMatch(/plan\.voice/);
    expect(edgeSource).not.toMatch(/cleanText\(\s*body\.voice/);
  });

  it('Edge Function は session 作成時に解決済み voice を渡す', () => {
    expect(edgeSource).toMatch(/output: \{ voice, speed: OUTPUT_SPEED \}/);
    // 固定値 VOICE 定数が残っていない（＝取り残しで常に marin になっていない）
    expect(edgeSource).not.toMatch(/const VOICE = /);
  });

  it('Edge Function は APIキー・client secret をログへ出さない', () => {
    const logs = [...edgeSource.matchAll(/console\.(log|error|warn)\(([^\n]*)/g)].map((m) => m[2]);
    for (const line of logs) {
      // 変数の実体を出していないか（関数名 "ai-lesson-token" のような文字列は対象外）
      expect(line).not.toMatch(
        /\$\{?\s*(apiKey|serviceKey|token|clientSecret|secret)\b|\b(apiKey|serviceKey|clientSecret)\b|secret\.value/,
      );
    }
  });

  it('先生ペルソナもサーバー側で決める（名前の注入経路を作らない）', () => {
    expect(edgeSource).toMatch(/TEACHER_PERSONA/);
    expect(edgeSource).not.toMatch(/cleanText\(\s*(body|plan)\.teacherName/);
  });
});

describe('クライアントが送る値', () => {
  const origFetch = globalThis.fetch;
  let sent: Record<string, unknown> | null = null;

  beforeEach(() => {
    sent = null;
    // マイク取得を成功させ、token取得で止める（WebRTCまでは進めない）
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
    });
    globalThis.fetch = vi.fn(async (_url: unknown, init?: { body?: string }) => {
      sent = JSON.parse(init?.body ?? '{}');
      // トークン取得を失敗させて WebRTC へ進ませない（テストを軽くする）
      return { ok: false, status: 503, json: async () => ({ error: 'stub' }) };
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  const plan = {
    themeLabel: 't', estimatedLevel: 'N3', zhSupport: 'whenStuck', correction: 'summary',
    target: { label: 'l', example: 'e', zhMeaning: 'm', zhExample: 'x' },
  };
  const noop = () => {};
  const callbacks = {
    onStatus: noop, onUserTranscript: noop, onTutorTranscript: noop,
    onTutorSpeaking: noop, onUserSpeaking: noop, onError: noop, onFinishLesson: noop,
  };

  const startAndWait = async (teacherId?: string) => {
    startVoiceSession({ sessionId: 's1', accessToken: 'jwt', teacherId, plan, callbacks });
    // connect() は非同期。fetch が呼ばれるまで待つ
    for (let i = 0; i < 50 && sent === null; i += 1) await new Promise((r) => setTimeout(r, 5));
    return sent;
  };

  it('teacherId を送る', async () => {
    expect(await startAndWait('yuto')).toMatchObject({ teacherId: 'yuto' });
  });

  it('voice 文字列は一切送らない', async () => {
    const body = await startAndWait('yuto');
    expect(body).not.toHaveProperty('voice');
    expect(JSON.stringify(body)).not.toContain('cedar');
    expect(JSON.stringify(body)).not.toContain('marin');
  });

  it('teacherId 未指定でも送信できる（サーバー側で既定へ倒れる）', async () => {
    const body = await startAndWait(undefined);
    expect(body).toBeTruthy();
    expect((body as Record<string, unknown>).teacherId).toBeUndefined();
  });
});

describe('未選択・不正値の扱い（クライアント表示側）', () => {
  it('未選択は既定の先生（＝従来の見え方）', () => {
    expect(resolveTeacher(null).id).toBe(DEFAULT_TEACHER_ID);
    expect(resolveTeacher(undefined).id).toBe(DEFAULT_TEACHER_ID);
  });

  it('壊れた値でも既定の先生へ倒れる', () => {
    expect(resolveTeacher('nobody' as never).id).toBe(DEFAULT_TEACHER_ID);
    expect(resolveTeacher(123 as never).id).toBe(DEFAULT_TEACHER_ID);
  });

  it('音声の説明に性別の断定を書かない', () => {
    for (const t of ALL_TEACHERS) {
      for (const s of [t.voiceToneJa, t.voiceToneZh]) {
        expect(s).not.toMatch(/女性|男性|女声|男声|女生|男生/);
      }
    }
  });
});
