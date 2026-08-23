// Realtime API（GA）の session.update の形を固定する（2026-08-23 実生徒監査P1）。
//
// 実機の console に「realtime event error: Missing required parameter: 'session.type'」が出ていた。
// 旧形式 `{ session: { turn_detection } }` / `{ session: { instructions } }` は GA 版で拒否されるため、
// VAD の誤割り込み対策も、残り35秒の「まとめ移行」の instructions も一度も効いていなかった。
// サーバー（ai-lesson-token）は既に GA 形式（session.type='realtime'・audio.input.turn_detection）で
// セッションを作っているので、クライアント側の update も同じ形に揃える。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./voiceSession.ts', import.meta.url), 'utf8');

describe('voiceSession: session.update は GA 形式', () => {
  it('すべての session.update に session.type: realtime が付いている', () => {
    const updates = SRC.match(/type: 'session\.update', session: \{[^\n]*/g) ?? [];
    expect(updates.length).toBeGreaterThanOrEqual(2);
    for (const u of updates) expect(u, u).toMatch(/session: \{ type: 'realtime'/);
  });

  it('turn_detection は audio.input 配下に置く（トップレベルに置かない）', () => {
    expect(SRC).toMatch(/audio: \{ input: \{ turn_detection: opts\.turnDetection \} \}/);
    expect(SRC).not.toMatch(/session: \{ turn_detection:/);
  });
});
