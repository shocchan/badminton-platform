// 個人復習パックの純関数と、実際に発行するパックJSONの検品。
//
// ここで守りたいこと:
//  1. 壊れた問題（選択肢不足・空欄なし）を画面に出さない
//  2. **冒険（route/mastery/skills/xp/streak）に一切書き込まない**
//  3. docs/ai-course/personal-packs/*.json が、アプリの復元で1問も落ちない
//     （落ちると「N問あります」の表示が実際より多くなる＝嘘になる）
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLOZE_BLANK, dueItems, emptyPersonalPackState, intervalDaysFor, isDue, personalPacksVisible,
  presentPersonalItem, recordFor, restorePersonalPack, restorePersonalPacks,
  restorePersonalPackState, summarizePack, withAnswer,
  type PersonalPack,
} from './advPersonalPack';
import { defaultAdvProfile, readAdvProfile, writeAdvProfile } from '../advProfile';
import type { AdventureV2Profile } from '../advTypes';
import type { LearnerSettings } from '../../types';

const item = (id: string, over: Record<string, unknown> = {}) => ({
  id, kind: 'reading', promptJa: `${id}の文`, target: id, answer: `こたえ-${id}`,
  distractors: ['だみー1', 'だみー2'], ...over,
});

const pack = (over: Record<string, unknown> = {}): unknown => ({
  packId: 'test-pack', titleJa: 'テスト', titleZh: '测试',
  passages: [{ id: 'p1', titleJa: '本文', textJa: '私の文章です。' }],
  items: [item('a'), item('b')],
  issuedAtISO: '2026-08-24T00:00:00.000Z',
  ...over,
});

describe('restorePersonalPack', () => {
  it('正しいパックはそのまま復元される', () => {
    const p = restorePersonalPack(pack());
    expect(p?.packId).toBe('test-pack');
    expect(p?.items).toHaveLength(2);
    expect(p?.passages).toHaveLength(1);
  });

  it('選択肢が足りない問題は落とす（2択未満は当てずっぽうで当たるため）', () => {
    const p = restorePersonalPack(pack({ items: [item('a'), item('b', { distractors: ['ひとつだけ'] })] }));
    expect(p?.items.map((i) => i.id)).toEqual(['a']);
  });

  it('正解と同じダミー・重複ダミーは選択肢に数えない', () => {
    const p = restorePersonalPack(pack({
      items: [item('a', { distractors: ['こたえ-a', 'だみー1', 'だみー1'] })],
    }));
    expect(p).toBeNull();
  });

  it('空欄のない cloze は落とす（どこに入れるか分からないため）', () => {
    const bad = item('c', { kind: 'cloze', promptJa: '空欄のない文' });
    const good = item('d', { kind: 'cloze', promptJa: `これは${CLOZE_BLANK}です` });
    const p = restorePersonalPack(pack({ items: [bad, good] }));
    expect(p?.items.map((i) => i.id)).toEqual(['d']);
  });

  it('答えが例文にそのまま書いてある問題は落とす（写すだけで正解できるため）', () => {
    const leaked = item('leak', {
      kind: 'meaning', promptJa: '夢を叶えるためには、丈夫な体が必要です。', target: '夢を叶える',
      answer: '夢を叶える', distractors: ['夢を見る', '夢が覚める'],
    });
    const fixed = item('fixed', {
      kind: 'meaning', promptJa: '夢を叶えるためには、丈夫な体が必要です。', target: '夢を叶える',
      answer: '实现梦想', distractors: ['做梦', '从梦中醒来'],
    });
    const p = restorePersonalPack(pack({ items: [leaked, fixed] }));
    expect(p?.items.map((i) => i.id)).toEqual(['fixed']);
  });

  it('出題が1問も残らないパックは入口を作らない（null）', () => {
    expect(restorePersonalPack(pack({ items: [] }))).toBeNull();
    expect(restorePersonalPacks([pack({ items: [] }), pack()])).toHaveLength(1);
    expect(restorePersonalPack(null)).toBeNull();
    expect(restorePersonalPack({ packId: 'A B C' })).toBeNull();
  });
});

describe('復習の間隔（実測の連続正解だけで決める）', () => {
  const now = '2026-08-24T00:00:00.000Z';

  it('正解のたびに次の復習が先へ伸びる', () => {
    let st = emptyPersonalPackState();
    st = withAnswer(st, 'p', 'a', true, now);
    const first = recordFor(st, 'p', 'a');
    expect(first.streak).toBe(1);
    expect(first.nextReviewISO).toBe('2026-08-25T00:00:00.000Z');
    st = withAnswer(st, 'p', 'a', true, '2026-08-25T00:00:00.000Z');
    expect(recordFor(st, 'p', 'a').nextReviewISO).toBe('2026-08-28T00:00:00.000Z');
    expect(intervalDaysFor(1)).toBe(1);
    expect(intervalDaysFor(99)).toBe(30);
  });

  it('間違えたら連続は0に戻り、その日のうちにもう一度出る', () => {
    let st = withAnswer(emptyPersonalPackState(), 'p', 'a', true, now);
    st = withAnswer(st, 'p', 'a', false, '2026-08-25T00:00:00.000Z');
    const rec = recordFor(st, 'p', 'a');
    expect(rec.streak).toBe(0);
    expect(rec.correct).toBe(1);
    expect(rec.attempts).toBe(2);
    expect(isDue(rec, '2026-08-25T00:00:00.000Z')).toBe(true);
  });

  it('パックが違えば記録は混ざらない（キーは packId::itemId）', () => {
    const st = withAnswer(emptyPersonalPackState(), 'p1', 'a', true, now);
    expect(recordFor(st, 'p2', 'a').attempts).toBe(0);
  });

  it('今日の出題は「未着手 → 復習日が来た順」で、上限を超えない', () => {
    const p = restorePersonalPack(pack({ items: [item('a'), item('b'), item('c')] })) as PersonalPack;
    const st = withAnswer(emptyPersonalPackState(), p.packId, 'a', false, now);
    const due = dueItems(p, st, now, 2);
    expect(due.map((i) => i.id)).toEqual(['b', 'c']);
    expect(dueItems(p, st, now).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('復習日が来ていない問題は今日出さない', () => {
    const p = restorePersonalPack(pack()) as PersonalPack;
    let st = withAnswer(emptyPersonalPackState(), p.packId, 'a', true, now);
    st = withAnswer(st, p.packId, 'b', true, now);
    expect(dueItems(p, st, now)).toHaveLength(0);
    expect(summarizePack(p, st, now)).toMatchObject({ total: 2, started: 2, steady: 0, dueNow: 0 });
    // 翌日になれば両方戻ってくる
    expect(dueItems(p, st, '2026-08-25T12:00:00.000Z')).toHaveLength(2);
  });
});

describe('出題', () => {
  it('選択肢には必ず正解が1つ入り、seedが同じなら並びも同じ', () => {
    const p = restorePersonalPack(pack()) as PersonalPack;
    const target = p.items[0]!;
    const a = presentPersonalItem(target, 42);
    const b = presentPersonalItem(target, 42);
    expect(a.choices).toEqual(b.choices);
    expect(a.choices).toHaveLength(3);
    expect(a.choices[a.correctIndex]).toBe(target.answer);
  });
});

describe('冒険への非干渉', () => {
  const now = '2026-08-24T00:00:00.000Z';

  it('パックが無ければ入口を出さない', () => {
    const prof = defaultAdvProfile(now);
    expect(personalPacksVisible(prof)).toBe(false);
    expect(personalPacksVisible({ ...prof, personalPacks: restorePersonalPacks([pack()]) })).toBe(true);
  });

  it('復習しても route / mastery / skills / xp / streak は1ミリも変わらない', () => {
    const base: AdventureV2Profile = {
      ...defaultAdvProfile(now),
      xp: 120,
      mastery: { 'stage-1': [] } as AdventureV2Profile['mastery'],
      streak: { current: 5, best: 9, lastActiveKey: '2026-08-23' },
      personalPacks: restorePersonalPacks([pack()]),
    };
    const next: AdventureV2Profile = {
      ...base,
      personalPack: withAnswer(base.personalPack, 'test-pack', 'a', true, now),
    };
    expect(next.xp).toBe(base.xp);
    expect(next.mastery).toBe(base.mastery);
    expect(next.skills).toBe(base.skills);
    expect(next.route).toBe(base.route);
    expect(next.streak).toBe(base.streak);
    expect(next.mockLog).toBe(base.mockLog);
    expect(recordFor(next.personalPack, 'test-pack', 'a').attempts).toBe(1);
  });

  it('settings への保存・読み戻しでパックと記録が生き残る', () => {
    const prof: AdventureV2Profile = {
      ...defaultAdvProfile(now),
      enabled: true,
      personalPacks: restorePersonalPacks([pack()]),
      personalPack: withAnswer(emptyPersonalPackState(), 'test-pack', 'a', true, now),
    };
    const settings = writeAdvProfile({} as LearnerSettings, prof, now);
    const back = readAdvProfile(settings);
    expect(back?.personalPacks).toHaveLength(1);
    expect(recordFor(back!.personalPack, 'test-pack', 'a').streak).toBe(1);
  });

  it('壊れた記録でも落ちない（正解数は試行数を超えない）', () => {
    const st = restorePersonalPackState({
      records: { 'p::a': { attempts: 2, correct: 99, streak: -3 }, 'p::b': 'こわれている' },
      lastStudiedAtISO: 5,
    });
    expect(recordFor(st, 'p', 'a')).toMatchObject({ attempts: 2, correct: 2, streak: 0 });
    expect(recordFor(st, 'p', 'b').attempts).toBe(0);
    expect(st.lastStudiedAtISO).toBeNull();
    expect(restorePersonalPackState(null)).toEqual(emptyPersonalPackState());
  });
});

/* ── 発行予定のパックJSONの検品（落ちる問題があれば発行前にここで気づく） ── */
describe('docs/ai-course/personal-packs の実データ', () => {
  const dir = join(import.meta.dirname, '../../../../../../docs/ai-course/personal-packs');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('パックJSONが1つ以上ある', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file}: 1問も落ちずに復元でき、問題として成立している`, () => {
      const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      const restored = restorePersonalPack(raw);
      expect(restored).not.toBeNull();
      // 落ちた問題があると、画面の「◯問あります」が実際より多くなる
      expect(restored!.items).toHaveLength(raw.items.length);
      const ids = new Set<string>();
      for (const i of restored!.items) {
        expect(ids.has(i.id), `id重複: ${i.id}`).toBe(false);
        ids.add(i.id);
        expect(i.distractors, `${i.id}: 正解がダミーに混ざっている`).not.toContain(i.answer);
        // 答えが例文に書いてあると、意味が分からなくても写すだけで正解できる
        expect(i.promptJa, `${i.id}: 答え「${i.answer}」が例文にそのまま書いてある`).not.toContain(i.answer);
        for (const d of i.distractors) {
          expect(i.promptJa, `${i.id}: ダミー「${d}」が例文に出ている（消去法のヒントになる）`).not.toContain(d);
        }
        if (i.kind === 'meaning') {
          // meaning は「日本語の表現 → 中国語の意味」。答えにかなが入っていたら向きが逆
          expect(i.answer, `${i.id}: meaning の答えは中国語の意味`).not.toMatch(/[ぁ-んァ-ヶ]/);
        }
        if (i.kind === 'reading') {
          // 読みの問題は、本人の文の中にその語がある＝自分の文章の復習になっている
          expect(i.promptJa, `${i.id}: 本文に「${i.target}」が無い`).toContain(i.target);
          expect(i.answer, `${i.id}: 読みがひらがなでない`).toMatch(/^[ぁ-んー・]+$/);
          for (const d of i.distractors) expect(d, `${i.id}: ダミーがひらがなでない`).toMatch(/^[ぁ-んー・]+$/);
        }
        if (i.kind === 'cloze') expect(i.promptJa.split(CLOZE_BLANK)).toHaveLength(2);
      }
    });
  }
});
