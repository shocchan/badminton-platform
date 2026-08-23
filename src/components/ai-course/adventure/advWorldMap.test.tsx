// @vitest-environment jsdom
// 冒険旅の世界地図（AdvWorldMap）の検査（2026-08-19 CEO要望「スタンプカードではなく冒険旅のマップに」）。
// 旧 advMapOverview.test.tsx の後継（AdvMapOverview → AdvWorldMap 置き換えに伴い改名）。
//
// 世界地図は buildAdventureMap() の実測の**別ビュー**であり、新しい状態を作らない（原則13）。
// 旧全体図から維持する検査（①〜⑥）＋世界地図で追加する検査（⑦〜⑨）:
//   ① ノード数 = regions.length（欠けも水増しもない）
//   ② 現在地ノードはちょうど1つ（buildAdventureMap の保証をそのまま描いている）
//   ③ ノードタップで onSelectRegion が該当 id で呼ばれる（→親が地域カードへスクロール）
//   ④ totalCount 0（ルート未生成）では何も描かない
//   ⑤ aria-label に名前と状態が入る（色だけに頼らない）
//   ⑥ 偽の進捗が無い: 金の道の本数 = **各レーン内** index>0 の done 数
//      （旧全体図は1本道だったが、世界地図は試験=背骨／会話=環状路の2レーンで
//        同一レーン内の隣接だけを結ぶため、期待式をレーン単位に更新）
//   ⑦ 全ノード中心のペア距離 ≥ 44（N5/N4/N3/N2 × exam/combined。44pxタップが重ならない）
//   ⑧ 雲海ボタンは 目標N5/N4/N3 かつ非conversation のみ。タップで吹き出しが出て、
//      onSelectRegion は呼ばれない（現ルート外はカードへ飛ばさない）
//   ⑨ conversation ルートは海辺クロップ（viewBox「0 300 360 300」。山とJLPTの約束を見せない）
// 3状態（新規／学習中／全攻略）× 4ルート（N5/N4/N3/N2）で描画が壊れないこと。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { AdvWorldMap } from './AdvWorldMap';
import {
  buildAdventureMap, worldMapWindow, type AdventureMap, type MapRouteKind,
} from '../../../lib/aiLesson/course/adventure/advMapModel';
import { defaultAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import { generateRoute } from '../../../lib/aiLesson/course/adventure/advRoute';
import { layoutWorldNodes } from '../../../lib/aiLesson/course/adventure/advWorldSpine';
import type {
  AdventureV2Profile, AdvBand, AdvGoalType, JlptLevel,
} from '../../../lib/aiLesson/course/adventure/advTypes';

afterEach(cleanup);

const NOW = '2026-08-19T00:00:00.000Z';

const profileFor = (
  goalType: AdvGoalType, target: JlptLevel = 'N2', band: AdvBand = 'n4',
): AdventureV2Profile => {
  const targetJlpt = goalType === 'conversation' ? null : target;
  return {
    ...defaultAdvProfile(NOW),
    enabled: true,
    goalType,
    targetJlpt,
    dailyMinutes: 15,
    route: generateRoute({
      goalType, targetJlpt,
      knowledgeBand: band, conversationBand: 'n4', diagnosis: null, nowISO: NOW,
    }),
  };
};

/** mastered の量だけ変えて実測mapを作る（状態はすべて buildAdventureMap 由来） */
const mapFor = (
  p: AdventureV2Profile, kind: MapRouteKind, masteredCount: number | 'all', week = 1,
): AdventureMap => {
  const ids = p.route!.stages.map((s) => s.stageId);
  const mastered = new Set(masteredCount === 'all' ? ids : ids.slice(0, masteredCount));
  return buildAdventureMap(p, p.route, mastered, week, kind, NOW);
};

const CLOUD_LABEL = 'この先の土地（目標を上げると開きます）';

/** 絵に載る地域（AdvWorldMap 内部と同じ12地域の窓・2026-08-23）。一覧は全地域のまま */
const shownOf = (map: AdventureMap) => worldMapWindow(map.regions, map.currentRegionId);

const renderMap = (map: AdventureMap, p: AdventureV2Profile) => {
  const onSelectRegion = vi.fn();
  const { container } = render(
    <AdvWorldMap lang="ja"
      regions={map.regions} currentRegionId={map.currentRegionId}
      destinationJa={map.destinationJa} destinationZh={map.destinationZh}
      doneCount={map.doneCount} totalCount={map.totalCount}
      onSelectRegion={onSelectRegion}
      targetJlpt={p.targetJlpt} routeKind={map.routeKind} />,
  );
  const nav = screen.getByRole('navigation', { name: 'マップ全体図（タップでその地域へ移動）' });
  // 地域ノードのbuttonだけ（雲海のタップ領域は除く）
  const buttons = within(nav).getAllByRole('button')
    .filter((b) => (b.getAttribute('aria-label') ?? '') !== CLOUD_LABEL);
  return { container, nav, onSelectRegion, buttons };
};

/** 金の道（done区間の実線・太さ5）。stroke 色は AdvWorldMap の仕様値。
 *  ※ 太さも見るのは、「次の目的地」ミニランドマークの金の輪郭（太さ2.4）を数えないため */
const goldPaths = (c: HTMLElement) => c.querySelectorAll('path[stroke="#f59e0b"][stroke-width="5"]');

/** ⑥の期待式: 各レーン内 index>0 の done 数（同一レーン内の隣接だけを道で結ぶため） */
const expectedGold = (map: AdventureMap): number => (['exam', 'conversation'] as const)
  .map((layer) => map.regions.filter((r) => r.layer === layer))
  .reduce((acc, lane) => acc + lane.filter((r, i) => i > 0 && r.state === 'done').length, 0);

describe('世界地図は実測regionsの別ビュー（3状態で壊れない・偽の進捗が無い）', () => {
  it('新規（mastered 0）: ノード数=地域数・現在地1つ・金の道は実測doneぶんだけ', () => {
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 0);
    const { container, buttons } = renderMap(map, p);

    // ① ノード数 = regions.length
    expect(buttons.length).toBe(shownOf(map).length);
    // ② 現在地ノードはちょうど1つ
    expect(buttons.filter((b) => b.getAttribute('aria-current') === 'step').length).toBe(1);
    expect(buttons.filter((b) => (b.getAttribute('aria-label') ?? '').includes('現在地')).length).toBe(1);
    // ⑥ 偽の進捗が無い: done表示は実測と同数（新規なので水増しがあれば即失敗）
    const doneReal = map.regions.filter((r) => r.state === 'done').length;
    expect(buttons.filter((b) => (b.getAttribute('aria-label') ?? '').includes('攻略済み')).length).toBe(doneReal);
    expect(goldPaths(container).length).toBe(expectedGold(map));
    expect(expectedGold(map)).toBe(0);
  });

  it('学習中（途中までmastered・総合ルート）: done が prefix でなくても区間単位で正しく塗る', () => {
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 3);
    expect(map.doneCount).toBeGreaterThan(0); // 前提: 実測で攻略済みがある状態
    const { container, buttons } = renderMap(map, p);

    expect(buttons.length).toBe(shownOf(map).length);
    expect(buttons.filter((b) => b.getAttribute('aria-current') === 'step').length).toBe(1);
    // ⑥ 「攻略済み」ノード＝実測done。金の道＝「done地域へ入る区間」の数（レーン内判定）
    const doneReal = map.regions.filter((r) => r.state === 'done').length;
    expect(buttons.filter((b) => (b.getAttribute('aria-label') ?? '').includes('攻略済み')).length).toBe(doneReal);
    expect(goldPaths(container).length).toBe(expectedGold(map));

    // ⑤ aria-label に名前・鍛える力・状態が入る（色だけに頼らない）
    const first = shownOf(map)[0];
    const label = `${first.nameJa}、${first.abilityJa}、`;
    const btn = buttons.find((b) => (b.getAttribute('aria-label') ?? '').startsWith(label));
    expect(btn, `先頭地域のノードが見つからない: ${label}`).toBeTruthy();
  });

  it('⑥ レーン分割: 会話レーンのdoneはレーン内の隣接だけを金にする（レーンをまたいで数えない）', () => {
    // 会話は週で進む: week 4 なら conv-w1..w3 が実測done
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 3, 4);
    const { container } = renderMap(map, p);
    const lane = expectedGold(map);
    // レーンをまたぐ旧式のフラットな数え方とは実際に差が出る状態であること（検査の意味を保証）
    const flat = map.regions.filter((r, i) => i > 0 && r.state === 'done').length;
    expect(map.regions.filter((r) => r.layer === 'conversation' && r.state === 'done').length)
      .toBeGreaterThan(0);
    expect(lane).not.toBe(flat);
    expect(goldPaths(container).length).toBe(lane);
  });

  it('③ ノードタップで onSelectRegion が該当 id で呼ばれる', () => {
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 3);
    const { buttons, onSelectRegion } = renderMap(map, p);
    const target = shownOf(map)[shownOf(map).length - 1];
    const btn = buttons.find((b) =>
      (b.getAttribute('aria-label') ?? '').startsWith(`${target.nameJa}、`));
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(onSelectRegion).toHaveBeenCalledWith(target.id);
  });

  it('全攻略（試験ルート・current無し）でも落ちず、全ノードが攻略済み表示になる', () => {
    const p = profileFor('jlpt');
    const map = mapFor(p, 'exam', 'all');
    expect(map.doneCount).toBe(map.totalCount); // 前提: 実測で全攻略
    expect(map.currentRegionId).toBeNull();
    const { buttons } = renderMap(map, p);

    expect(buttons.length).toBe(shownOf(map).length);
    expect(buttons.filter((b) => b.getAttribute('aria-current') === 'step').length).toBe(0);
    expect(buttons.filter((b) => (b.getAttribute('aria-label') ?? '').includes('攻略済み')).length)
      .toBe(shownOf(map).length);
    // 頂上の旗ラベルは destination の実データのみ
    expect(screen.getByText(map.destinationJa)).toBeTruthy();
  });

  it('④ totalCount 0（ルート未生成）では何も描かない', () => {
    const { container } = render(
      <AdvWorldMap lang="ja" regions={[]} currentRegionId={null}
        destinationJa="" destinationZh="" doneCount={0} totalCount={0}
        onSelectRegion={() => {}} targetJlpt={null} routeKind="combined" />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('①渡り: 3状態 × N5/N4/N3/N2 のどのルートでも描画が壊れない（jsdom描画確認）', () => {
    for (const target of ['N5', 'N4', 'N3', 'N2'] as const) {
      for (const mastered of [0, 2, 'all'] as const) {
        const p = profileFor('hybrid', target);
        const map = mapFor(p, 'combined', mastered);
        const { buttons } = renderMap(map, p);
        expect(buttons.length, `target=${target} mastered=${mastered}`).toBe(shownOf(map).length);
        cleanup();
      }
    }
  });
});

describe('⑦ ノード間隔 — 44pxタップ領域が重ならない（layoutWorldNodes 単体）', () => {
  for (const band of ['needs_assessment', 'n4'] as AdvBand[]) {
    for (const target of ['N5', 'N4', 'N3', 'N2'] as const) {
      for (const kind of ['exam', 'combined'] as const) {
        it(`band=${band} target=${target} kind=${kind}: 全ノードペア距離 ≥ 44`, () => {
          const p = profileFor('hybrid', target, band);
          const map = mapFor(p, kind, 0);
          // 絵に置くのは AdvWorldMap と同じ「現在地を含む12地域の窓」（2026-08-23）
          const shown = worldMapWindow(map.regions, map.currentRegionId);
          const lay = layoutWorldNodes(shown, target, kind);
          const exam = shown.filter((r) => r.layer === 'exam');
          const conv = shown.filter((r) => r.layer === 'conversation');
          expect(lay.examPts.length).toBe(exam.length);
          expect(lay.convPts.length).toBe(conv.length);
          const pts = [...lay.examPts, ...lay.convPts];
          for (let i = 0; i < pts.length; i += 1) {
            for (let j = i + 1; j < pts.length; j += 1) {
              const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
              expect(d, `ノード${i}(${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}) と ` +
                `ノード${j}(${pts[j].x.toFixed(1)},${pts[j].y.toFixed(1)}) が近すぎる`)
                .toBeGreaterThanOrEqual(44);
            }
          }
        });
      }
    }
  }
});

describe('⑧ 雲海（目標より先の土地）', () => {
  it('目標N5（試験ルート）: 雲海ボタンがあり、タップで吹き出し・onSelectRegionは不発', () => {
    const p = profileFor('jlpt', 'N5');
    const map = mapFor(p, 'exam', 0);
    const { onSelectRegion } = renderMap(map, p);
    const cloud = screen.getByRole('button', { name: CLOUD_LABEL });
    fireEvent.click(cloud);
    expect(screen.getByText(/この先は次の目標の土地です。目標を上げると道が伸びます。攻略済みの地域はそのまま引き継がれます/)).toBeTruthy();
    expect(onSelectRegion).not.toHaveBeenCalled();
    // 再タップでトグルして閉じる
    fireEvent.click(cloud);
    expect(screen.queryByText(/この先は次の目標の土地です/)).toBeNull();
  });

  it('目標N2: 雲海なし（塔=世界の頂。N1未対応を偽って見せない）', () => {
    const p = profileFor('hybrid', 'N2');
    const map = mapFor(p, 'combined', 0);
    renderMap(map, p);
    expect(screen.queryByRole('button', { name: CLOUD_LABEL })).toBeNull();
  });

  it('conversationルート: 雲海なし（海辺クロップに山とJLPTの約束を見せない）', () => {
    const p = profileFor('hybrid', 'N5');
    const map = mapFor(p, 'conversation', 0);
    renderMap(map, p);
    expect(screen.queryByRole('button', { name: CLOUD_LABEL })).toBeNull();
  });
});

describe('⑨ conversationルートは海辺クロップ', () => {
  it('conversation: viewBox が「0 300 360 300」', () => {
    const p = profileFor('conversation');
    const map = mapFor(p, 'conversation', 0);
    const { container } = renderMap(map, p);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 300 360 300');
  });

  it('combined: viewBox は全景「0 0 360 600」', () => {
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 0);
    const { container } = renderMap(map, p);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 360 600');
  });
});
