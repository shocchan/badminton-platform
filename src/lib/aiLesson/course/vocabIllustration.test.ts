// Phase B-4: 語彙イラストの網羅と、機械で検出できる意味の取り違えを固定する。
import { describe, it, expect } from 'vitest';
import { ALL_SCENES, ILLUSTRATION_MANIFEST, illustrationCoverage, illustrationFor } from './vocabIllustrationManifest';
import { allVocabularyItems } from './foundationVocabBank';

const ids = [...new Set(allVocabularyItems().map((i) => i.id))];

describe('イラストの網羅（B-4）', () => {
  it('canonical 140語すべてにassetがあり、欠けがない', () => {
    const c = illustrationCoverage(ids);
    expect(c.total).toBe(140);
    expect(c.missing).toEqual([]);
    expect(c.assetExists).toBe(140);
  });

  it('140語すべてが学習者の画面に出せる状態になっている', () => {
    expect(illustrationCoverage(ids).learnerVisible).toBe(140);
  });

  it('存在しないitemIdへのsceneがない（dead asset 0）', () => {
    const idSet = new Set(ids);
    expect(ALL_SCENES.map((s) => s.itemId).filter((id) => !idSet.has(id))).toEqual([]);
  });

  it('itemIdの重複がない', () => {
    const list = ALL_SCENES.map((s) => s.itemId);
    expect(new Set(list).size).toBe(list.length);
  });

  it('人間の一括承認をしていない（approvedはAI画像側の既存分だけ）', () => {
    const svg = ILLUSTRATION_MANIFEST.filter((e) => e.assetType === 'svg_fallback');
    expect(svg.every((e) => e.humanApproved === false)).toBe(true);
  });
});

describe('イラストの中身（B-4）', () => {
  it('altは日本語・中国語の両方があり、空でない', () => {
    for (const e of ILLUSTRATION_MANIFEST) {
      expect(e.altJa.trim().length, e.itemId).toBeGreaterThan(3);
      expect(e.altZh.trim().length, e.itemId).toBeGreaterThan(3);
    }
  });

  it('altに日本語と中国語が混ざっていない（zh側にかなを残さない）', () => {
    const kana = /[ぁ-んァ-ヴ]/;
    expect(ILLUSTRATION_MANIFEST.filter((e) => kana.test(e.altZh)).map((e) => e.itemId)).toEqual([]);
  });

  it('altにラテン文字の混入がない（英単語の書き残し）', () => {
    const latin = /[A-Za-z]{3,}/;
    const bad = ILLUSTRATION_MANIFEST.filter((e) => latin.test(e.altJa) || latin.test(e.altZh));
    expect(bad.map((e) => e.itemId)).toEqual([]);
  });

  it('altが全語で固有（説明を使い回していない）', () => {
    const ja = ILLUSTRATION_MANIFEST.map((e) => e.altJa);
    const zh = ILLUSTRATION_MANIFEST.map((e) => e.altZh);
    expect(new Set(ja).size).toBe(ja.length);
    expect(new Set(zh).size).toBe(zh.length);
  });

  it('sceneが空でない（人も物も無い白紙を作らない）', () => {
    for (const s of ALL_SCENES) {
      const parts = (s.figures?.length ?? 0) + (s.props?.length ?? 0)
        + (s.arrows?.length ?? 0) + (s.sizePair ? 1 : 0) + (s.bubble ? 1 : 0);
      expect(parts, s.itemId).toBeGreaterThan(0);
    }
  });

  it('構図が全語で固有（場所・人・物・向きの組み合わせを使い回していない）', () => {
    const key = (s: typeof ALL_SCENES[number]) => JSON.stringify([
      s.place,
      s.figures?.map((f) => [f.x, f.dir, f.pose, f.mood]),
      s.props?.map((p) => [p.kind, p.x, p.y]),
      s.arrows?.map((a) => [a.x, a.y, a.dir]),
      s.sizePair, s.bubble,
    ]);
    const keys = ALL_SCENES.map(key);
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dup).toEqual([]);
  });

  it('部品はすべて画面の中に収まっている（見切れ・欠けを作らない）', () => {
    for (const s of ALL_SCENES) {
      for (const f of s.figures ?? []) {
        expect(f.x, `${s.itemId} figure.x`).toBeGreaterThanOrEqual(10);
        expect(f.x, `${s.itemId} figure.x`).toBeLessThanOrEqual(110);
      }
      for (const p of s.props ?? []) {
        expect(p.x, `${s.itemId} prop.x`).toBeGreaterThanOrEqual(0);
        expect(p.x, `${s.itemId} prop.x`).toBeLessThanOrEqual(120);
        expect(p.y, `${s.itemId} prop.y`).toBeGreaterThanOrEqual(0);
        expect(p.y, `${s.itemId} prop.y`).toBeLessThanOrEqual(90);
      }
    }
  });
});

describe('対になる語の向き（B-4 §12）', () => {
  // 同じ場所・同じ画角で、方向だけが逆になっていること。
  // ここが崩れると「入る」の絵で出ていく人が描かれるような取り違えが起きる。
  const pairs: [string, string][] = [
    ['fi-hairu', 'fi-deru'],
    ['fi-noru', 'fi-oriru'],
    ['fi-iku', 'fi-kuru'],
    ['fi-hajimeru', 'fi-owaru'],
    ['fi-fueru', 'fi-heru'],
    ['fi-oboeru', 'fi-wasureru'],
    ['fi-ookii', 'fi-chiisai'],
    ['fi-takai', 'fi-yasui'],
    ['fi-atarashii', 'fi-furui'],
    ['fi-atsui', 'fi-samui'],
    ['fi-chikai', 'fi-tooi'],
    ['fi-ooi', 'fi-sukunai'],
    ['fi-ureshii', 'fi-kanashii'],
  ];

  it('対になる語は同じ場所で描かれている', () => {
    for (const [a, b] of pairs) {
      const sa = illustrationFor(a)?.scene;
      const sb = illustrationFor(b)?.scene;
      expect(sa, a).toBeTruthy();
      expect(sb, b).toBeTruthy();
      expect(sa!.place, `${a} vs ${b}`).toBe(sb!.place);
    }
  });

  it('方向を持つ対は、矢印の向きが実際に逆になっている', () => {
    const directional: [string, string][] = [
      ['fi-hairu', 'fi-deru'],
      ['fi-noru', 'fi-oriru'],
      ['fi-iku', 'fi-kuru'],
      ['fi-oboeru', 'fi-wasureru'],
    ];
    for (const [a, b] of directional) {
      const da = illustrationFor(a)!.scene!.arrows?.[0]?.dir;
      const db = illustrationFor(b)!.scene!.arrows?.[0]?.dir;
      expect(da, `${a} に方向がない`).toBeTruthy();
      expect(db, `${b} に方向がない`).toBeTruthy();
      expect(da, `${a} と ${b} の向きが同じになっている`).not.toBe(db);
    }
  });

  it('自動詞／他動詞の対は「人が手を出しているか」で描き分けている', () => {
    // 自動詞側には動作主を描かない。他動詞側には必ず描く。
    const intransitiveTransitive: [string, string][] = [
      ['fi-kawaru', 'fi-kaeru-change'],
      ['fi-kimaru', 'fi-kimeru'],
      ['fi-tsuzuku', 'fi-tsuzukeru'],
    ];
    for (const [intr, tr] of intransitiveTransitive) {
      expect(illustrationFor(intr)!.scene!.figures?.length ?? 0, `${intr} に人を描かない`).toBe(0);
      expect(illustrationFor(tr)!.scene!.figures?.length ?? 0, `${tr} には人を描く`).toBeGreaterThan(0);
    }
  });
});
