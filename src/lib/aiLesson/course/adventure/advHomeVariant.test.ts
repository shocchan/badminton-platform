// ホームの表示方式フラグと素材の受入テスト（2026-08-22・第2フェーズ）。
//
// 守るのは4つ:
//   ① 既定は v2（2026-08-22 CEO承認で v1 から切替）
//   ② ?home=v2 で v2、?home=v1 で戻せる、?home=reset で保存が消える
//   ③ storage が壊れていても落ちない（private mode）
//   ④ ヒーロー帯は**用意できている街だけ**返す（無い街に「絵があるふり」をしない）
import { describe, it, expect } from 'vitest';
import {
  resolveHomeVariant, DEFAULT_HOME_VARIANT, HOME_VARIANT_STORAGE_KEY,
} from './advHomeVariant';
import { heroForArea, HOME_HEROES, HERO_ID_BY_AREA } from './advHomeAssets';

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
};

describe('ホームの表示方式フラグ', () => {
  it('① 何も無ければ既定 v2（CEO承認で切替）', () => {
    expect(DEFAULT_HOME_VARIANT).toBe('v2');
    expect(resolveHomeVariant()).toBe('v2');
    expect(resolveHomeVariant({ search: '?home=bogus', storage: mem() })).toBe('v2');
  });

  it('② ?home=v1 で旧ホームへ戻せる。?home=reset で保存が消えて既定へ', () => {
    const s = mem();
    expect(resolveHomeVariant({ search: '?home=v1', storage: s })).toBe('v1');
    expect(s.dump()).toEqual({ [HOME_VARIANT_STORAGE_KEY]: 'v1' });
    // クエリが落ちても保存値で v1 のまま（戻したい人を勝手に v2 へ戻さない）
    expect(resolveHomeVariant({ search: '', storage: s })).toBe('v1');
    expect(resolveHomeVariant({ search: '?home=v2', storage: s })).toBe('v2');
    expect(resolveHomeVariant({ search: '?home=reset', storage: s })).toBe('v2');
    expect(s.dump()).toEqual({});
  });

  it('③ storage が投げても落ちない', () => {
    const broken = {
      getItem: () => { throw new Error('nope'); },
      setItem: () => { throw new Error('nope'); },
      removeItem: () => { throw new Error('nope'); },
    };
    expect(resolveHomeVariant({ search: '?home=v1', storage: broken })).toBe('v1');
    expect(resolveHomeVariant({ search: '', storage: broken })).toBe('v2');
  });
});

describe('ヒーロー帯の素材', () => {
  it('④ 用意できている街だけ返す。知らない areaId は null', () => {
    expect(heroForArea('area01-minato')).not.toBeNull();
    expect(heroForArea('area08-sorano')).not.toBeNull();
    expect(heroForArea('area99-unknown')).toBeNull();
    expect(heroForArea(null)).toBeNull();
    expect(heroForArea(undefined)).toBeNull();
  });

  it('地図の全エリアに行き先がある（対応表に穴が無い）', () => {
    // 会話の港・記憶の庭は近い景色で受ける。ここが欠けると帯が出ない日ができる
    for (const areaId of ['area01-minato', 'area02-hinode', 'area03-toorimichi', 'area04-ichiba',
      'area05-yukari', 'area06-hataraki', 'area07-katachi', 'area08-sorano',
      'area09-katari', 'area10-omoide']) {
      const id = HERO_ID_BY_AREA[areaId];
      expect(id, `${areaId} の対応が無い`).toBeTruthy();
      expect(HOME_HEROES[id], `${areaId} → ${id} の素材が無い`).toBeTruthy();
    }
  });

  it('寸法は 3:1（帯の高さが崩れない）', () => {
    for (const [id, a] of Object.entries(HOME_HEROES)) {
      expect(a.width / a.height, `${id}`).toBeCloseTo(3, 2);
      expect(a.webp1x).toMatch(/^\/ai-course\/home\/hero-.+@1x\.webp$/);
      expect(a.webp2x).toMatch(/^\/ai-course\/home\/hero-.+@2x\.webp$/);
    }
  });
});
