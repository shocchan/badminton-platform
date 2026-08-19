// @vitest-environment jsdom
// マップ全体図（AdvMapOverview）の検査（2026-08-19 CEO要望）。
//
// 見取り図は buildAdventureMap() の実測の**別ビュー**であり、新しい状態を作らない（原則13）。
// ここで確かめること:
//   ① ノード数 = regions.length（欠けも水増しもない）
//   ② 現在地ノードはちょうど1つ（buildAdventureMap の保証をそのまま描いている）
//   ③ ノードタップで onSelectRegion が該当 id で呼ばれる（→親が地域カードへスクロール）
//   ④ totalCount 0（ルート未生成）では何も描かない
//   ⑤ aria-label に名前と状態が入る（色だけに頼らない）
//   ⑥ 偽の進捗が無い: 「攻略済み」ノード数と金の道の本数が実測 done と一致する
// 3状態（新規／学習中／全攻略）すべてで描画が壊れないこと。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { AdvMapOverview } from './AdvMapOverview';
import { buildAdventureMap, type AdventureMap, type MapRouteKind } from '../../../lib/aiLesson/course/adventure/advMapModel';
import { defaultAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import { generateRoute } from '../../../lib/aiLesson/course/adventure/advRoute';
import type { AdventureV2Profile, AdvGoalType } from '../../../lib/aiLesson/course/adventure/advTypes';

afterEach(cleanup);

const NOW = '2026-08-19T00:00:00.000Z';

const profileFor = (goalType: AdvGoalType): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW),
  enabled: true,
  goalType,
  targetJlpt: 'N2',
  dailyMinutes: 15,
  route: generateRoute({
    goalType, targetJlpt: 'N2',
    knowledgeBand: 'n4', conversationBand: 'n4', diagnosis: null, nowISO: NOW,
  }),
});

/** mastered の量だけ変えて実測mapを作る（状態はすべて buildAdventureMap 由来） */
const mapFor = (goalType: AdvGoalType, kind: MapRouteKind, masteredCount: number | 'all'): AdventureMap => {
  const p = profileFor(goalType);
  const ids = p.route!.stages.map((s) => s.stageId);
  const mastered = new Set(masteredCount === 'all' ? ids : ids.slice(0, masteredCount));
  return buildAdventureMap(p, p.route, mastered, 1, kind, NOW);
};

const renderOverview = (map: AdventureMap) => {
  const onSelectRegion = vi.fn();
  const { container } = render(
    <AdvMapOverview lang="ja"
      regions={map.regions} currentRegionId={map.currentRegionId}
      destinationJa={map.destinationJa} destinationZh={map.destinationZh}
      doneCount={map.doneCount} totalCount={map.totalCount}
      onSelectRegion={onSelectRegion} />,
  );
  const nav = screen.getByRole('navigation', { name: 'マップ全体図（タップでその地域へ移動）' });
  return { container, nav, onSelectRegion, buttons: within(nav).getAllByRole('button') };
};

/** 金の道（done区間の実線）。stroke 色は AdvMapOverview の仕様値 */
const goldPaths = (c: HTMLElement) => c.querySelectorAll('path[stroke="#f59e0b"]');

describe('マップ全体図は実測regionsの別ビュー（3状態で壊れない・偽の進捗が無い）', () => {
  it('新規（mastered 0）: ノード数=地域数・現在地1つ・金の道は実測doneぶんだけ', () => {
    const map = mapFor('hybrid', 'combined', 0);
    const { container, buttons } = renderOverview(map);

    // ① ノード数 = regions.length
    expect(buttons.length).toBe(map.regions.length);
    // ② 現在地ノードはちょうど1つ
    expect(buttons.filter((b) => b.getAttribute('aria-current') === 'step').length).toBe(1);
    expect(buttons.filter((b) => (b.getAttribute('aria-label') ?? '').includes('現在地')).length).toBe(1);
    // ⑥ 偽の進捗が無い: done表示は実測と同数（新規なので水増しがあれば即失敗）
    const doneReal = map.regions.filter((r) => r.state === 'done').length;
    expect(buttons.filter((b) => (b.getAttribute('aria-label') ?? '').includes('攻略済み')).length).toBe(doneReal);
    expect(goldPaths(container).length)
      .toBe(map.regions.filter((r, i) => i > 0 && r.state === 'done').length);
  });

  it('学習中（途中までmastered・総合ルート）: done が prefix でなくても区間単位で正しく塗る', () => {
    const map = mapFor('hybrid', 'combined', 3);
    expect(map.doneCount).toBeGreaterThan(0); // 前提: 実測で攻略済みがある状態
    const { container, buttons } = renderOverview(map);

    expect(buttons.length).toBe(map.regions.length);
    expect(buttons.filter((b) => b.getAttribute('aria-current') === 'step').length).toBe(1);
    // ⑥ 「攻略済み」ノード＝実測done。金の道＝「done地域へ入る区間」の数（区間単位判定）
    const doneReal = map.regions.filter((r) => r.state === 'done').length;
    expect(buttons.filter((b) => (b.getAttribute('aria-label') ?? '').includes('攻略済み')).length).toBe(doneReal);
    expect(goldPaths(container).length)
      .toBe(map.regions.filter((r, i) => i > 0 && r.state === 'done').length);

    // ⑤ aria-label に名前・鍛える力・状態が入る（色だけに頼らない）
    const first = map.regions[0];
    const label = `${first.nameJa}、${first.abilityJa}、`;
    const btn = buttons.find((b) => (b.getAttribute('aria-label') ?? '').startsWith(label));
    expect(btn, `先頭地域のノードが見つからない: ${label}`).toBeTruthy();
  });

  it('③ ノードタップで onSelectRegion が該当 id で呼ばれる', () => {
    const map = mapFor('hybrid', 'combined', 3);
    const { buttons, onSelectRegion } = renderOverview(map);
    const target = map.regions[map.regions.length - 1];
    const btn = buttons.find((b) =>
      (b.getAttribute('aria-label') ?? '').startsWith(`${target.nameJa}、`));
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(onSelectRegion).toHaveBeenCalledWith(target.id);
  });

  it('全攻略（試験ルート・current無し）でも落ちず、全ノードが攻略済み表示になる', () => {
    const map = mapFor('jlpt', 'exam', 'all');
    expect(map.doneCount).toBe(map.totalCount); // 前提: 実測で全攻略
    expect(map.currentRegionId).toBeNull();
    const { buttons } = renderOverview(map);

    expect(buttons.length).toBe(map.regions.length);
    expect(buttons.filter((b) => b.getAttribute('aria-current') === 'step').length).toBe(0);
    expect(buttons.filter((b) => (b.getAttribute('aria-label') ?? '').includes('攻略済み')).length)
      .toBe(map.regions.length);
    // 頂上の旗ラベルは destination の実データのみ
    expect(screen.getByText(map.destinationJa)).toBeTruthy();
  });

  it('④ totalCount 0（ルート未生成）では何も描かない', () => {
    const { container } = render(
      <AdvMapOverview lang="ja" regions={[]} currentRegionId={null}
        destinationJa="" destinationZh="" doneCount={0} totalCount={0}
        onSelectRegion={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
