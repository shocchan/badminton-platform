// @vitest-environment jsdom
// World Map主要ナビゲーション化のテスト（2026-07-30 CEO要望 §6-§12・§22）。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { IslandsMap, AREA_NODE_WIDTH_PCT, AREA_NODE_MIN_PX } from './IslandsMap';
import { WORLD_AREAS } from '../../../lib/aiLesson/course/rpg/worldAtlas';
import { areaNodeStateOf } from '../../../lib/aiLesson/course/rpg/worldProgress';
import type { AreaNodeState } from '../../../lib/aiLesson/course/rpg/worldProgress';
import { aiCourseI18n } from '../../../locales/aiCourse';

afterEach(cleanup);
const t = aiCourseI18n.ja;
const tz = aiCourseI18n.zh;
const base = { t, areas: WORLD_AREAS, currentAreaId: 'area01-minato', clarity: 'clear' as const };

describe('Area node（街全体がクリック領域・§7）', () => {
  it('全10エリアがbuttonとしてinteractive（透明巨大領域ではなくnode単位）', () => {
    render(<IslandsMap {...base} onOpenArea={() => {}} />);
    const nodes = document.querySelectorAll('button[data-area-node]');
    expect(nodes.length).toBe(10);
    for (const n of nodes) {
      expect(n.tagName).toBe('BUTTON');
      expect((n as HTMLButtonElement).type).toBe('button');
    }
  });
  it('route destination: 各nodeのclickが自エリアIDだけでonOpenAreaを呼ぶ（機械検証）', () => {
    const onOpen = vi.fn();
    render(<IslandsMap {...base} onOpenArea={onOpen} />);
    for (const a of WORLD_AREAS) {
      const btn = document.querySelector(`button[data-area-node="${a.areaId}"]`)!;
      fireEvent.click(btn);
      expect(onOpen).toHaveBeenLastCalledWith(a.areaId);
    }
    expect(onOpen).toHaveBeenCalledTimes(10);
  });
  it('click領域はVisual・名前・CTAを含む単一node（min-h-11=44px保証class付き）', () => {
    render(<IslandsMap {...base} onOpenArea={() => {}} />);
    for (const btn of document.querySelectorAll('button[data-area-node]')) {
      expect(btn.className).toContain('min-h-11');
      expect(btn.querySelector('svg')).toBeTruthy();          // 街Visual
      expect(btn.textContent).toMatch(/›/);                    // 常時CTA chevron
    }
    expect(AREA_NODE_MIN_PX).toBeGreaterThanOrEqual(44);
  });
  it('ノード同士がoverlapしない（座標×ノード幅の幾何検証・4:3補正）', () => {
    const pos = WORLD_AREAS.map(a => a.pos);
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = (pos[i].y - pos[j].y) * 0.75; // container 4:3 → y%はx%の0.75倍の実距離
        const dist = Math.hypot(dx, dy);
        expect(dist, `${WORLD_AREAS[i].areaId}×${WORLD_AREAS[j].areaId}`).toBeGreaterThanOrEqual(AREA_NODE_WIDTH_PCT);
      }
    }
  });
  it('街名はhoverしなくても常時表示（hover中だけ見える仕様にしない・§8）', () => {
    render(<IslandsMap {...base} onOpenArea={() => {}} />);
    for (const a of WORLD_AREAS) {
      const short = a.nameJa.split('（')[0];
      const btn = document.querySelector(`button[data-area-node="${a.areaId}"]`)!;
      expect(btn.textContent).toContain(short);
    }
  });
});

describe('hover/focus/keyboard（§8-§9）', () => {
  it('hover相当の表示要素: 浮き上がりtransform・影・panelのclassが宣言されている', () => {
    render(<IslandsMap {...base} onOpenArea={() => {}} />);
    const btn = document.querySelector('button[data-area-node="area02-hinode"]')!;
    expect(btn.className).toContain('hover:-translate-y-1.5');
    expect(btn.className).toContain('hover:scale-[1.04]');
    expect(btn.className).toContain('focus-visible:-translate-y-1.5');
    expect(btn.className).toContain('focus-visible:ring-2');
    expect(btn.className).toContain('cursor-pointer');
    // panel（この街へ・学習テーマ）はgroup-hover/focus-visibleで出る
    const panel = btn.querySelector('.group-hover\\:block');
    expect(panel?.textContent).toContain(t.world.enterArea);
  });
  it('keyboard: Tab到達（native button）＋Enter/Spaceで遷移（clickイベント）', () => {
    const onOpen = vi.fn();
    render(<IslandsMap {...base} onOpenArea={onOpen} />);
    const btn = document.querySelector('button[data-area-node="area08-sorano"]') as HTMLButtonElement;
    btn.focus();
    expect(document.activeElement).toBe(btn);
    fireEvent.click(btn); // native buttonはEnter/Space→clickへ正規化される
    expect(onOpen).toHaveBeenCalledWith('area08-sorano');
  });
  it('aria-label: ja=「◯◯へ入る。…を学びます。」/ zh=「进入「◯◯」。学习…。」（固有名詞は日本語のまま・§4C）', () => {
    const { unmount } = render(<IslandsMap {...base} onOpenArea={() => {}} />);
    expect(screen.getByRole('button', { name: 'ミナトへ入る。自己紹介・あいさつ・基礎のことばを学びます。' })).toBeTruthy();
    unmount();
    render(<IslandsMap {...base} t={tz} onOpenArea={() => {}} />);
    const sorano = WORLD_AREAS.find(a => a.areaId === 'area08-sorano')!;
    expect(screen.getByRole('button', { name: `进入「ソラノ塔」。学习${sorano.learningThemeZh}。` })).toBeTruthy();
  });
  it('zh: hoverパネルに中国語glossと学習テーマが出る（名前は日本語主表示）', () => {
    render(<IslandsMap {...base} t={tz} onOpenArea={() => {}} />);
    const btn = document.querySelector('button[data-area-node="area08-sorano"]')!;
    expect(btn.textContent).toContain('ソラノ塔');       // 主表示=日本語固有名詞
    expect(btn.textContent).toContain('N2语法之塔');     // gloss
    expect(btn.textContent).toContain(tz.world.enterArea);
  });
});

describe('状態別表示（§11）', () => {
  const stateMap: Record<string, AreaNodeState> = {
    'area01-minato': 'current', 'area02-hinode': 'completed', 'area10-omoide': 'review_due', 'area03-toorimichi': 'locked',
  };
  const stateOf = (a: { areaId: string }) => stateMap[a.areaId] ?? 'available';
  it('current: aria-current・現在地ラベル・主人公・進入可能', () => {
    const onOpen = vi.fn();
    render(<IslandsMap {...base} onOpenArea={onOpen} stateOf={stateOf} />);
    const btn = document.querySelector('button[data-area-node="area01-minato"]')!;
    expect(btn.getAttribute('aria-current')).toBe('true');
    expect(btn.textContent).toContain(t.world.currentLabel);
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith('area01-minato');
  });
  it('completed: 完了表示＋再訪可能（クリック可）・薄くしすぎない（opacity低下classなし）', () => {
    const onOpen = vi.fn();
    render(<IslandsMap {...base} onOpenArea={onOpen} stateOf={stateOf} />);
    const btn = document.querySelector('button[data-area-node="area02-hinode"]')!;
    expect(btn.textContent).toContain(t.world.areaCompleted);
    expect(btn.className).not.toContain('opacity-');
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith('area02-hinode');
  });
  it('review_due: 復習ありmarker＋進入可能', () => {
    const onOpen = vi.fn();
    render(<IslandsMap {...base} onOpenArea={onOpen} stateOf={stateOf} />);
    const btn = document.querySelector('button[data-area-node="area10-omoide"]')!;
    expect(btn.textContent).toContain(t.world.reviewAvailable);
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith('area10-omoide');
  });
  it('locked: click不可・aria-disabled・not-allowed・正直な解放条件・「準備中」を使わない', () => {
    const onOpen = vi.fn();
    render(<IslandsMap {...base} onOpenArea={onOpen} stateOf={stateOf}
      unlockConditionOf={() => '前のエリアの単元を完了する'} />);
    const btn = document.querySelector('button[data-area-node="area03-toorimichi"]')!;
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.className).toContain('cursor-not-allowed');
    expect(btn.getAttribute('aria-label')).toContain('開放条件: 前のエリアの単元を完了する');
    fireEvent.click(btn);
    expect(onOpen).not.toHaveBeenCalled();
    expect(btn.textContent).not.toContain('準備中');
    expect(btn.textContent).not.toContain('coming soon');
  });
  it('areaNodeStateOf: 実導出（current優先→庭園review_due→n3完了→available）・書き込みなし', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null };
    const garden = WORLD_AREAS.find(a => a.areaId === 'area10-omoide')!;
    const minato = WORLD_AREAS.find(a => a.areaId === 'area01-minato')!;
    expect(areaNodeStateOf(store, minato, 'area01-minato', 0)).toBe('current');
    expect(areaNodeStateOf(store, garden, 'area01-minato', 3)).toBe('review_due');
    expect(areaNodeStateOf(store, garden, 'area01-minato', 0)).toBe('available');
    expect(areaNodeStateOf(store, minato, 'area02-hinode', 0)).toBe('available'); // 未完了n3
  });
});

describe('Reduced Motion（§12）', () => {
  it('reducedMotion時: transition/浮遊classなし・機能は完全維持（click可・CTA表示）', () => {
    const onOpen = vi.fn();
    render(<IslandsMap {...base} reducedMotion onOpenArea={onOpen} />);
    const btn = document.querySelector('button[data-area-node="area05-yukari"]')!;
    expect(btn.className).not.toContain('transition-transform');
    expect(btn.className).not.toContain('hover:-translate-y-1.5');
    expect(btn.textContent).toMatch(/›/);            // animationなしでも押せると分かる
    expect(btn.className).toContain('cursor-pointer');
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith('area05-yukari');
    // 現在地リングのanimate要素も出さない
    const cur = document.querySelector('button[data-area-node="area01-minato"]')!;
    expect(cur.querySelector('animate')).toBeNull();
  });
  it('motion-safe接頭辞: 通常時も浮遊はmotion-safe限定（OSのreduced-motionで自動停止）', () => {
    render(<IslandsMap {...base} onOpenArea={() => {}} />);
    const btn = document.querySelector('button[data-area-node="area05-yukari"]')!;
    expect(btn.className).toContain('motion-safe:hover:-translate-y-1.5');
  });
});
