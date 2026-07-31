// @vitest-environment jsdom
// Phase B-4: イラストが「manifestにある」ではなく「学習者の画面に出る」ことを固定する。
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { VocabImage } from './VocabImage';
import { VocabScene } from './VocabScene';
import { allVocabularyItems } from '../../../../lib/aiLesson/course/foundationVocabBank';
import { ALL_SCENES, illustrationFor } from '../../../../lib/aiLesson/course/vocabIllustrationManifest';

afterEach(cleanup);
const items = allVocabularyItems();

describe('イラストが実際に描画される（B-4）', () => {
  it('140語すべてがSVGとして描画でき、例外で落ちない', () => {
    let drawn = 0;
    for (const item of items) {
      const { container, unmount } = render(<VocabImage item={item} labPreview={false} />);
      const svg = container.querySelector('svg');
      expect(svg, `${item.id} の絵が出ていない`).toBeTruthy();
      // 図形が実際に入っている（空のSVG枠を出さない）
      expect(svg!.querySelectorAll('rect, circle, path, ellipse').length, item.id).toBeGreaterThan(3);
      drawn += 1;
      unmount();
    }
    expect(drawn).toBe(140);
  });

  it('絵の中に文字を描いていない（文字なしで意味が分かる方針）', () => {
    for (const spec of ALL_SCENES) {
      const { container, unmount } = render(<VocabScene spec={spec} lang="ja" />);
      expect(container.querySelectorAll('text, tspan, foreignObject').length, spec.itemId).toBe(0);
      unmount();
    }
  });

  it('altは表示言語に従う（中国語表示で日本語のaltを読ませない）', () => {
    const item = items.find((i) => i.id === 'fi-hairu')!;
    const entry = illustrationFor('fi-hairu')!;
    const zh = render(<VocabImage item={item} labPreview={false} lang="zh" />);
    expect(zh.container.querySelector('svg')!.getAttribute('aria-label')).toBe(entry.altZh);
    cleanup();
    const ja = render(<VocabImage item={item} labPreview={false} lang="ja" />);
    expect(ja.container.querySelector('svg')!.getAttribute('aria-label')).toBe(entry.altJa);
  });

  it('出題では答えのヒントになるaltを渡さない（decorative）', () => {
    const item = items.find((i) => i.id === 'fi-taberu')!;
    const { container } = render(<VocabImage item={item} labPreview={false} decorative />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('aria-label')).toBeNull();
  });

  it('通常表示では role=img と altが付く（支援技術に絵の内容が伝わる）', () => {
    const item = items.find((i) => i.id === 'fi-neko')!;
    const { container } = render(<VocabImage item={item} labPreview={false} lang="ja" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')!.length).toBeGreaterThan(3);
  });

  it('同じ語なら何度描いても同じ絵になる（決定的）', () => {
    const item = items.find((i) => i.id === 'fi-noru')!;
    const a = render(<VocabImage item={item} labPreview={false} />).container.innerHTML;
    cleanup();
    const b = render(<VocabImage item={item} labPreview={false} />).container.innerHTML;
    expect(a).toBe(b);
  });

  it('対になる語は別々の絵になる（同じ絵を使い回していない）', () => {
    const pairs = [['fi-hairu', 'fi-deru'], ['fi-noru', 'fi-oriru'], ['fi-ooi', 'fi-sukunai']];
    for (const [a, b] of pairs) {
      const ia = items.find((i) => i.id === a)!;
      const ib = items.find((i) => i.id === b)!;
      const ha = render(<VocabImage item={ia} labPreview={false} />).container.innerHTML;
      cleanup();
      const hb = render(<VocabImage item={ib} labPreview={false} />).container.innerHTML;
      cleanup();
      expect(ha, `${a} と ${b} が同じ絵`).not.toBe(hb);
    }
  });
});
