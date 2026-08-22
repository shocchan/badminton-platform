// @vitest-environment jsdom
// 世界地図・画像背景版と表示方式フラグの検査（2026-08-22・画像差し替えの土台）。
//
// 画像はまだ無い（ChatGPT 生成待ち）。ここで守るのは「土台」の約束:
//   ① フラグ既定は 'svg'（URL も localStorage も無ければ旧 SVG 版。<img> は出ない）
//   ② ?map=image で画像版。srcset / width / height / loading=lazy / decoding=async / alt(ja/zh) を持つ。localStorage に保存される
//   ③ 画像版で読込エラー → 旧 SVG 版へ自動フォールバック（<img> ごと消え、ノード数・タップは変わらない）
//   ④ 読込成功 → 自作SVG風景が消えて画像が見える（ノード・道は残る）
//   ⑤ 会話ルート: viewBox は下半分クロップのまま・画像も object-position 50% 100%（下半分）
//   ⑥ ?map=svg は保存済みの image を上書きし、?map=reset は保存を消す
//   ⑦ asset=null なら即 SVG 版（画像を無効化できる）
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { AdvWorldMapImage, AdvWorldMapSwitch } from './AdvWorldMapImage';
import {
  buildAdventureMap, type AdventureMap, type MapRouteKind,
} from '../../../lib/aiLesson/course/adventure/advMapModel';
import { defaultAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import { generateRoute } from '../../../lib/aiLesson/course/adventure/advRoute';
import {
  resolveWorldMapVariant, WORLD_MAP_VARIANT_STORAGE_KEY, DEFAULT_WORLD_MAP_VARIANT,
} from '../../../lib/aiLesson/course/adventure/advWorldMapVariant';
import { WORLD_MAP_BG } from '../../../lib/aiLesson/course/adventure/advWorldMapAssets';
import type { AdventureV2Profile, AdvGoalType, JlptLevel } from '../../../lib/aiLesson/course/adventure/advTypes';

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/ja/ai-course');
});

const NOW = '2026-08-22T00:00:00.000Z';
const NAV_NAME = 'マップ全体図（タップでその地域へ移動）';
const CLOUD_LABEL = 'この先の土地（目標を上げると開きます）';

const profileFor = (goalType: AdvGoalType, target: JlptLevel = 'N2'): AdventureV2Profile => {
  const targetJlpt = goalType === 'conversation' ? null : target;
  return {
    ...defaultAdvProfile(NOW), enabled: true, goalType, targetJlpt, dailyMinutes: 15,
    route: generateRoute({
      goalType, targetJlpt, knowledgeBand: 'n4', conversationBand: 'n4', diagnosis: null, nowISO: NOW,
    }),
  };
};
const mapFor = (p: AdventureV2Profile, kind: MapRouteKind, masteredCount: number): AdventureMap => {
  const ids = p.route!.stages.map((s) => s.stageId);
  return buildAdventureMap(p, p.route, new Set(ids.slice(0, masteredCount)), 1, kind, NOW);
};

const propsFor = (map: AdventureMap, p: AdventureV2Profile, lang: 'ja' | 'zh' = 'ja') => ({
  lang, regions: map.regions, currentRegionId: map.currentRegionId,
  destinationJa: map.destinationJa, destinationZh: map.destinationZh,
  doneCount: map.doneCount, totalCount: map.totalCount,
  onSelectRegion: vi.fn(), targetJlpt: p.targetJlpt, routeKind: map.routeKind,
});

const nodeButtons = (nav: HTMLElement) => within(nav).getAllByRole('button')
  .filter((b) => (b.getAttribute('aria-label') ?? '') !== CLOUD_LABEL);
const sceneryOf = (c: HTMLElement) => c.querySelector('[data-adv-scenery="svg"]');

describe('表示方式フラグ resolveWorldMapVariant（純関数）', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, v); },
      removeItem: (k: string) => { m.delete(k); },
      dump: () => Object.fromEntries(m),
    };
  };

  it('① 何も無ければ既定 svg', () => {
    expect(DEFAULT_WORLD_MAP_VARIANT).toBe('svg');
    expect(resolveWorldMapVariant()).toBe('svg');
    expect(resolveWorldMapVariant({ search: '', storage: mem() })).toBe('svg');
    expect(resolveWorldMapVariant({ search: '?map=bogus', storage: mem() })).toBe('svg');
  });

  it('② ?map=image は image を返し、storage に保存する', () => {
    const s = mem();
    expect(resolveWorldMapVariant({ search: '?map=image', storage: s })).toBe('image');
    expect(s.dump()).toEqual({ [WORLD_MAP_VARIANT_STORAGE_KEY]: 'image' });
    // クエリが落ちても保存値で image のまま
    expect(resolveWorldMapVariant({ search: '', storage: s })).toBe('image');
  });

  it('⑥ ?map=svg は保存済み image を上書き、?map=reset は保存を消して既定へ', () => {
    const s = mem();
    s.setItem(WORLD_MAP_VARIANT_STORAGE_KEY, 'image');
    expect(resolveWorldMapVariant({ search: '?map=svg', storage: s })).toBe('svg');
    expect(s.dump()).toEqual({ [WORLD_MAP_VARIANT_STORAGE_KEY]: 'svg' });
    expect(resolveWorldMapVariant({ search: '?map=reset', storage: s })).toBe('svg');
    expect(s.dump()).toEqual({});
  });

  it('storage が投げても落ちない（private mode 等）', () => {
    const broken = {
      getItem: () => { throw new Error('nope'); },
      setItem: () => { throw new Error('nope'); },
      removeItem: () => { throw new Error('nope'); },
    };
    expect(resolveWorldMapVariant({ search: '?map=image', storage: broken })).toBe('image');
    expect(resolveWorldMapVariant({ search: '', storage: broken })).toBe('svg');
  });
});

describe('AdvWorldMapSwitch（フラグで新旧を出し分ける入口）', () => {
  it('① 既定（クエリ無し・保存無し）は旧 SVG 版: <img> 無し・自作風景あり', () => {
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 0);
    const { container } = render(<AdvWorldMapSwitch {...propsFor(map, p)} />);
    const nav = screen.getByRole('navigation', { name: NAV_NAME });
    expect(nav.getAttribute('data-map-variant')).toBe('svg');
    expect(container.querySelector('img')).toBeNull();
    expect(sceneryOf(container)).toBeTruthy();
    expect(nodeButtons(nav).length).toBe(map.regions.length);
    expect(window.localStorage.getItem(WORLD_MAP_VARIANT_STORAGE_KEY)).toBeNull();
  });

  it('② ?map=image で画像版になり、localStorage に保存される', () => {
    window.history.replaceState({}, '', '/ja/ai-course?map=image');
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 2);
    const { container } = render(<AdvWorldMapSwitch {...propsFor(map, p)} />);
    const nav = screen.getByRole('navigation', { name: NAV_NAME });
    expect(nav.getAttribute('data-map-variant')).toBe('image');
    expect(nav.getAttribute('data-map-image-state')).toBe('loading');
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toBe(WORLD_MAP_BG.webp1x);
    expect(img!.getAttribute('srcset')).toBe(`${WORLD_MAP_BG.webp1x} 1x, ${WORLD_MAP_BG.webp2x} 2x`);
    expect(img!.getAttribute('width')).toBe(String(WORLD_MAP_BG.width));
    expect(img!.getAttribute('height')).toBe(String(WORLD_MAP_BG.height));
    expect(img!.getAttribute('loading')).toBe('lazy');
    expect(img!.getAttribute('decoding')).toBe('async');
    expect(img!.getAttribute('alt')).toContain('冒険の世界地図');
    expect(img!.style.aspectRatio).toBe('3 / 5');
    // 読込前は自作風景がプレースホルダとして残る
    expect(sceneryOf(container)).toBeTruthy();
    expect(window.localStorage.getItem(WORLD_MAP_VARIANT_STORAGE_KEY)).toBe('image');
  });

  it('保存済み image はクエリ無しでも効く。variant prop の明示が最優先', () => {
    window.localStorage.setItem(WORLD_MAP_VARIANT_STORAGE_KEY, 'image');
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 0);
    const a = render(<AdvWorldMapSwitch {...propsFor(map, p)} />);
    expect(screen.getByRole('navigation', { name: NAV_NAME }).getAttribute('data-map-variant')).toBe('image');
    a.unmount();
    render(<AdvWorldMapSwitch {...propsFor(map, p)} variant="svg" />);
    expect(screen.getByRole('navigation', { name: NAV_NAME }).getAttribute('data-map-variant')).toBe('svg');
  });

  it('zh: alt が中国語', () => {
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 0);
    const { container } = render(<AdvWorldMapSwitch {...propsFor(map, p, 'zh')} variant="image" />);
    expect(container.querySelector('img')!.getAttribute('alt')).toContain('冒险世界地图');
  });
});

describe('AdvWorldMapImage（画像版）のフォールバックと読込', () => {
  it('③ 画像エラー → 旧 SVG 版へ自動フォールバック（<img> 消滅・ノード数とタップは不変）', () => {
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 2);
    const props = propsFor(map, p);
    const { container } = render(<AdvWorldMapImage {...props} />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    fireEvent.error(img!);

    const nav = screen.getByRole('navigation', { name: NAV_NAME });
    expect(nav.getAttribute('data-map-variant')).toBe('svg');
    expect(nav.getAttribute('data-map-image-state')).toBe('error');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('picture')).toBeNull();
    expect(sceneryOf(container)).toBeTruthy();
    const buttons = nodeButtons(nav);
    expect(buttons.length).toBe(map.regions.length);
    expect(buttons.filter((b) => b.getAttribute('aria-current') === 'step').length).toBe(1);
    fireEvent.click(buttons[buttons.length - 1]);
    expect(props.onSelectRegion).toHaveBeenCalledWith(map.regions[map.regions.length - 1].id);
  });

  it('④ 読込成功 → 自作風景が消え、画像が残る（ノード・道はそのまま）', () => {
    const p = profileFor('hybrid', 'N3');
    const map = mapFor(p, 'combined', 1);
    const { container } = render(<AdvWorldMapImage {...propsFor(map, p)} />);
    fireEvent.load(container.querySelector('img')!);
    const nav = screen.getByRole('navigation', { name: NAV_NAME });
    expect(nav.getAttribute('data-map-image-state')).toBe('loaded');
    expect(sceneryOf(container)).toBeNull();
    expect(container.querySelector('img')).toBeTruthy();
    expect(nodeButtons(nav).length).toBe(map.regions.length);
    // 道（実ルートの区間）は描かれている
    expect(container.querySelectorAll('svg path').length).toBeGreaterThan(0);
    // N3 目標の雲海ボタンも残る
    expect(screen.getByRole('button', { name: CLOUD_LABEL })).toBeTruthy();
  });

  it('⑤ 会話ルート: viewBox 下半分クロップ＋画像は object-position 50% 100%・6:5', () => {
    const p = profileFor('conversation');
    const map = mapFor(p, 'conversation', 0);
    const { container } = render(<AdvWorldMapImage {...propsFor(map, p)} />);
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 300 360 300');
    const img = container.querySelector('img')!;
    expect(img.style.objectPosition).toBe('50% 100%');
    expect(img.style.aspectRatio).toBe('6 / 5');
  });

  it('⑦ asset=null → 即 SVG 版（<img> を出さない）', () => {
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 0);
    const { container } = render(<AdvWorldMapImage {...propsFor(map, p)} asset={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('navigation', { name: NAV_NAME }).getAttribute('data-map-variant')).toBe('svg');
  });

  it('AVIF は 1x/2x 両方そろったときだけ <source> を出す', () => {
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 0);
    // マニフェストに AVIF が入った後も「片方だけ」の条件を正しく検査する（2x を明示的に消す）
    const a = render(<AdvWorldMapImage {...propsFor(map, p)} asset={{ ...WORLD_MAP_BG, avif1x: '/x@1x.avif', avif2x: undefined }} />);
    expect(a.container.querySelector('source')).toBeNull();
    a.unmount();
    const b = render(<AdvWorldMapImage {...propsFor(map, p)}
      asset={{ ...WORLD_MAP_BG, avif1x: '/x@1x.avif', avif2x: '/x@2x.avif' }} />);
    const src = b.container.querySelector('source');
    expect(src?.getAttribute('type')).toBe('image/avif');
    expect(src?.getAttribute('srcset')).toBe('/x@1x.avif 1x, /x@2x.avif 2x');
  });

  it('totalCount 0 では画像版でも何も描かない', () => {
    const { container } = render(
      <AdvWorldMapImage lang="ja" regions={[]} currentRegionId={null}
        destinationJa="" destinationZh="" doneCount={0} totalCount={0}
        onSelectRegion={() => {}} targetJlpt={null} routeKind="combined" />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('ランドマークタイル（背景の上・道の下の SVG <image>）', () => {
  it('背景の読込完了後にだけタイルが出る。SVG版（フォールバック）には出ない', () => {
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 0);
    const tile = { id: 'minato', webp1x: '/t@1x.webp', webp2x: '/t@2x.webp', width: 1024, height: 512,
      anchor: [0.5, 1] as const, widthFrac: 0.5 };
    const r = render(<AdvWorldMapImage {...propsFor(map, p)} tileAssets={[tile]} />);
    // 読込前: 背景 <img> はあるがタイル無し（建物だけ先に浮かない）
    expect(r.container.querySelector('[data-adv-tile]')).toBeNull();
    const img = r.container.querySelector('img[data-adv-scenery], picture img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { value: 512, configurable: true });
    fireEvent.load(img);
    const el = r.container.querySelector('image[data-adv-tile="minato"]');
    expect(el).not.toBeNull();
    // 底辺中央が anchor: 幅 180、高さ 90、x=90、y=510（viewBox 360×600）
    expect(el?.getAttribute('width')).toBe('180');
    expect(el?.getAttribute('height')).toBe('90');
    expect(el?.getAttribute('x')).toBe('90');
    expect(el?.getAttribute('y')).toBe('510');
    // 1x 環境（jsdom の devicePixelRatio=1）では 1x を使う
    expect(el?.getAttribute('href')).toBe('/t@1x.webp');
    // タイル単体の失敗はそのタイルだけ消え、背景と道は残る
    fireEvent.error(el as Element);
    expect((el as SVGImageElement).style.display).toBe('none');
    expect(r.container.querySelector('picture')).not.toBeNull();
    r.unmount();
    // 背景が失敗 → SVG 版へ落ちる。タイルも出ない
    const f = render(<AdvWorldMapImage {...propsFor(map, p)} tileAssets={[tile]} />);
    fireEvent.error(f.container.querySelector('picture img') as HTMLImageElement);
    expect(f.container.querySelector('[data-adv-tile]')).toBeNull();
    expect(f.container.querySelector('[data-adv-scenery="svg"], svg')).not.toBeNull();
  });

  it('tileAssets=[]・markerAsset=null で画像の重ねを全部止められる（新旧比較用）', () => {
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 0);
    const r = render(<AdvWorldMapImage {...propsFor(map, p)} tileAssets={[]} markerAsset={null} />);
    const img = r.container.querySelector('picture img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { value: 512, configurable: true });
    fireEvent.load(img);
    expect(r.container.querySelector('[data-adv-tiles]')).toBeNull();
    expect(r.container.querySelector('[data-adv-marker]')).toBeNull();
  });

  it('現在地マーカーの絵は現在地の足元に敷かれ、当たり判定と aria は HTML ボタンのまま', () => {
    const p = profileFor('hybrid');
    const map = mapFor(p, 'combined', 0);
    const r = render(<AdvWorldMapImage {...propsFor(map, p)} tileAssets={[]} />);
    const img = r.container.querySelector('picture img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { value: 512, configurable: true });
    fireEvent.load(img);
    const marker = r.container.querySelector('image[data-adv-marker="current"]');
    expect(marker).not.toBeNull();
    // 絵は装飾。押せるのは今までどおり aria-current="step" のボタン
    expect(marker?.getAttribute('aria-hidden')).toBe('true');
    expect(r.container.querySelector('button[aria-current="step"]')).not.toBeNull();
    // 底辺が現在地。高さ 34（viewBox 単位）
    expect(Number(marker?.getAttribute('height'))).toBeCloseTo(34, 5);
  });
});
