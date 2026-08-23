// step の絵記号の割り当て（2026-08-23）。
// 守りたいのは「絵が無くても壊れない」「絵が入ったとき取り違えない」の2つ。
import { describe, it, expect } from 'vitest';
import { STEP_ICON_BY_KIND, STEP_ICONS, stepIconFor } from './advHomeAssets';
import type { AdvQuestStep } from './advTypes';

const ALL_KINDS: AdvQuestStep['kind'][] = [
  'review_due', 'weak_reinforce', 'grammar_new', 'vocab_new', 'battle',
  'reading_short', 'listening_practice', 'conversation_mission', 'restate', 'kana_dojo',
];

describe('割り当て', () => {
  it('すべての step 種別に絵記号が割り当ててある（新しい種別を足して忘れると落ちる）', () => {
    for (const k of ALL_KINDS) expect(STEP_ICON_BY_KIND[k]).toBeDefined();
  });

  it('意味の違うものが同じ絵にならない（語彙と文法、読解と聴解を取り違えない）', () => {
    expect(STEP_ICON_BY_KIND.vocab_new).not.toBe(STEP_ICON_BY_KIND.grammar_new);
    expect(STEP_ICON_BY_KIND.reading_short).not.toBe(STEP_ICON_BY_KIND.listening_practice);
    expect(STEP_ICON_BY_KIND.kana_dojo).not.toBe(STEP_ICON_BY_KIND.vocab_new);
  });

  it('同じ体験のものは同じ絵でよい（バトルと弱点補強、AI会話と言い直し）', () => {
    expect(STEP_ICON_BY_KIND.battle).toBe(STEP_ICON_BY_KIND.weak_reinforce);
    expect(STEP_ICON_BY_KIND.conversation_mission).toBe(STEP_ICON_BY_KIND.restate);
  });
});

describe('絵が無いあいだの挙動', () => {
  it('絵が未登録なら null を返す（存在しない画像を出して404にしない）', () => {
    for (const k of ALL_KINDS) {
      const id = STEP_ICON_BY_KIND[k]!;
      if (!STEP_ICONS[id]) expect(stepIconFor(k)).toBeNull();
    }
  });

  it('登録済みの絵は1x/2xの両方を持つ（片方だけ登録して滲ませない）', () => {
    for (const [id, a] of Object.entries(STEP_ICONS)) {
      expect(a.webp1x, id).toMatch(/@1x\.webp$/);
      expect(a.webp2x, id).toMatch(/@2x\.webp$/);
      expect(a.width, id).toBeGreaterThan(0);
      expect(a.height, id).toBeGreaterThan(0);
    }
  });
});

describe('登録した絵記号のファイルが実在する', () => {
  // 登録だけして画像を置き忘れると、画面に404の穴が空く。出荷前にここで落とす。
  it('STEP_ICONS の全idに @1x/@2x の実ファイルがある', async () => {
    const fs = await import('node:fs');
    for (const [id, a] of Object.entries(STEP_ICONS)) {
      for (const p of [a.webp1x, a.webp2x]) {
        expect(fs.existsSync(`public${p}`), `${id}: public${p} が無い`).toBe(true);
      }
    }
  });
});

describe('8種そろっている', () => {
  it('どの step 種別にも絵が出る（番号だけの行が混ざらない）', () => {
    for (const k of ALL_KINDS) expect(stepIconFor(k), k).not.toBeNull();
  });
});

describe('ヒーロー帯', () => {
  it('割り当てた地域の絵が実在する（借り物・404を作らない）', async () => {
    const fs = await import('node:fs');
    const { HERO_ID_BY_AREA, HOME_HEROES, heroForArea } = await import('./advHomeAssets');
    for (const [areaId, id] of Object.entries(HERO_ID_BY_AREA)) {
      const a = HOME_HEROES[id];
      if (!a) { expect(heroForArea(areaId), `${areaId}`).toBeNull(); continue; }
      for (const p of [a.webp1x, a.webp2x]) {
        expect(fs.existsSync(`public${p}`), `${areaId} → ${id}: public${p} が無い`).toBe(true);
      }
    }
  });
});

describe('地図タイル', () => {
  it('登録した地図タイルのファイルが実在する', async () => {
    const fs = await import('node:fs');
    const { WORLD_MAP_TILES } = await import('./advWorldMapAssets');
    for (const t of WORLD_MAP_TILES) {
      for (const p of [t.webp1x, t.webp2x]) {
        expect(fs.existsSync(`public${p}`), `${t.id}: public${p} が無い`).toBe(true);
      }
    }
  });

  it('会話ルートの2つは環状路（ノードが並ぶ道）の上に足元がある', async () => {
    // RING は y 480〜576（viewBox 360×600）＝正規化 0.80〜0.96。
    // ここに足元を置くとノードのボタンと重なって押しにくくなる。
    const { WORLD_MAP_TILES } = await import('./advWorldMapAssets');
    for (const id of ['katari', 'omoide']) {
      const t = WORLD_MAP_TILES.find((x) => x.id === id)!;
      expect(t, id).toBeDefined();
      expect(t.anchor[1], `${id} の足元が環状路に乗っている`).toBeLessThan(0.80);
    }
  });
});
