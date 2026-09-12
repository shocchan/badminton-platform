// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdvAvatarPicker } from './AdvAvatarPicker';
import { AdvMapTraveler } from './AdvMapTraveler';
import { AdvWorldMapImage } from './AdvWorldMapImage';
import { AdvRegionScene } from './AdvRegionScene';
import { defaultAdvProfile, readAdvProfile, writeAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import { buildAdventureMap } from '../../../lib/aiLesson/course/adventure/advMapModel';
import { avatarStyleOf } from '../../../lib/aiLesson/course/adventure/advAvatar';
import type { LearnerSettings } from '../../../lib/aiLesson/course/types';
afterEach(cleanup);
const now = '2026-09-12T00:00:00.000Z';
describe('traveler appearance', () => {
  it('restores both choices and preserves protected and unknown settings', () => {
    const p = defaultAdvProfile(now);
    const settings = { adventureV2: { ...p, teacherNotes: [], answerSheets: [], personalPacks: [], aiConversationOff: true,
      interviewPrep: { enabledAt: now, notes: {}, worksheet: {} }, futureField: { keep: true } }, futureTop: 'keep' } as unknown as LearnerSettings;
    for (const avatarStyle of ['male-blue', 'female-blue', 'flag'] as const) {
      const next = writeAdvProfile(settings, { ...readAdvProfile(settings)!, avatarStyle }, now);
      expect(readAdvProfile(next)?.avatarStyle).toBe(avatarStyle);
      const raw = next.adventureV2 as Record<string, unknown>;
      for (const key of ['teacherNotes', 'answerSheets', 'personalPacks', 'aiConversationOff', 'interviewPrep', 'futureField'])
        expect(raw[key]).toEqual((settings.adventureV2 as Record<string, unknown>)[key]);
      expect((next as unknown as Record<string, unknown>).futureTop).toBe('keep');
    }
    expect(avatarStyleOf('unknown')).toBe('flag');
    expect(readAdvProfile({ ...settings, adventureV2: { ...p, avatarStyle: 'unknown' } } as unknown as LearnerSettings)?.avatarStyle).toBe('flag');
    expect(readAdvProfile({ adventureV2: p } as unknown as LearnerSettings)?.avatarStyle).toBe('flag');
  });
  it.each(['ja', 'zh'] as const)('男性・女性の2択だけ（「表示しない」は出さない・2026-09-13）in %s', lang => {
    const onChange = vi.fn();
    render(<AdvAvatarPicker lang={lang} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    for (const [name, style] of [[/男性/, 'male-blue'], [/女性/, 'female-blue']] as const) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(onChange).toHaveBeenLastCalledWith(style);
    }
    expect(screen.queryByRole('button', { name: lang === 'ja' ? /キャラクターを表示しない/ : /不显示角色/ })).toBeNull();
  });
  it('初期設定モードは折りたたみ無しで選択肢だけを出す', () => {
    render(<AdvAvatarPicker lang="ja" onChange={vi.fn()} mode="onboarding" />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
  it('falls back on image error and recovers when another appearance is chosen', () => {
    const { container, rerender } = render(<AdvMapTraveler style="male-blue" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('[data-adv-traveler="flag"]')).toBeTruthy();
    rerender(<AdvMapTraveler style="female-blue" />);
    expect(container.querySelector('[data-adv-traveler="female-blue"]')).toBeTruthy();
  });
  it('keeps current traveler and buttons when the map background fails', () => {
    const p = { ...defaultAdvProfile(now), goalType: 'conversation' as const };
    const m = buildAdventureMap(p, null, new Set(), 1, 'conversation', now);
    const { container } = render(<AdvWorldMapImage lang="ja" regions={m.regions} currentRegionId={m.currentRegionId}
      destinationJa={m.destinationJa} destinationZh={m.destinationZh} doneCount={m.doneCount} totalCount={m.totalCount}
      onSelectRegion={vi.fn()} targetJlpt={null} routeKind="conversation" avatarStyle="female-blue" />);
    const count = screen.getAllByRole('button').length;
    fireEvent.error(container.querySelector('picture img')!);
    expect(container.querySelector('[data-map-variant="svg"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-adv-traveler="female-blue"]').length).toBe(1);
    expect(screen.getAllByRole('button').length).toBe(count);
    expect(container.querySelector('button[aria-current="step"]')?.className).toContain('h-11 w-11');
  });
  it('retains a scene when its image is unavailable', () => {
    const { container } = render(<AdvRegionScene kind="village" tone="night" fogged />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
