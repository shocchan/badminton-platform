import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homeEmphasis, activityIsPrimary, showActivityFirst } from './homeEmphasis';

describe('homeEmphasis', () => {
  it('2026-09-09 の実データ（通常活動9件 / 大会1件）では通常活動が主役', () => {
    expect(homeEmphasis({ upcomingActivities: 9, upcomingTournaments: 1 })).toBe('activity');
  });

  it('無いものを主役にしない', () => {
    expect(homeEmphasis({ upcomingActivities: 5, upcomingTournaments: 0 })).toBe('activity');
    expect(homeEmphasis({ upcomingActivities: 0, upcomingTournaments: 3 })).toBe('tournament');
  });

  it('どちらも無いときは balanced（片方だけを推さない）', () => {
    expect(homeEmphasis({ upcomingActivities: 0, upcomingTournaments: 0 })).toBe('balanced');
  });

  it('大会が2倍以上多ければ大会が主役（データが変われば自然に入れ替わる）', () => {
    expect(homeEmphasis({ upcomingActivities: 2, upcomingTournaments: 6 })).toBe('tournament');
  });

  it('拮抗していれば balanced', () => {
    expect(homeEmphasis({ upcomingActivities: 4, upcomingTournaments: 3 })).toBe('balanced');
    expect(homeEmphasis({ upcomingActivities: 3, upcomingTournaments: 4 })).toBe('balanced');
  });

  it('負の数が来ても落ちない', () => {
    expect(() => homeEmphasis({ upcomingActivities: -1, upcomingTournaments: -5 })).not.toThrow();
  });
});

describe('並べ方', () => {
  it('大会が主役のときだけ、大会が第一CTA', () => {
    expect(activityIsPrimary('tournament')).toBe(false);
    expect(activityIsPrimary('activity')).toBe(true);
    expect(activityIsPrimary('balanced')).toBe(true);
  });

  it('拮抗していても通常活動を先に置く（申込の9割が通常活動という実需に合わせる）', () => {
    expect(showActivityFirst('balanced')).toBe(true);
  });
});

describe('固定値に書き戻せないこと', () => {
  it('トップは homeEmphasis を使って並びを決めている（決め打ちに戻ったら気づく）', () => {
    const src = readFileSync(join(process.cwd(), 'src/pages/HomePage.tsx'), 'utf8');
    expect(src).toContain('homeEmphasis');
    expect(src).toContain('activityIsPrimary');
  });

  it('SEOの3点（title / h1 / canonical）は emphasis で動かさない', () => {
    const src = readFileSync(join(process.cwd(), 'src/pages/HomePage.tsx'), 'utf8');
    // canonical は言語だけで決まる（emphasis を混ぜない）
    expect(src).toContain('rel="canonical" href={`https://kawabado.com/${lang}/`}');
    // h1 は1つだけ
    expect((src.match(/<h1/g) ?? []).length).toBe(1);
  });
});
