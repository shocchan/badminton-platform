// @vitest-environment jsdom
// Phase 3P-3: オノマトペdraft画面の到達可能性（§13）とdraft明示のテスト。
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import OnoDraftsPanel from './OnoDraftsPanel';
import { aiCourseI18n } from '../../../../locales/aiCourse';
import { ONOMATOPOEIA_DRAFTS } from '../../../../lib/aiLesson/course/onomatopoeiaDrafts';
const t = aiCourseI18n.ja;

describe('オノマトペdraft内部画面', () => {
  afterEach(cleanup);
  it('タイトル・draft注意書き・全draftが一覧される（行き止まりなし）', () => {
    render(<OnoDraftsPanel t={t} onBack={() => {}} />);
    expect(screen.getByText(t.vocab.onoDraftsTitle)).toBeTruthy();
    expect(screen.getByText(t.vocab.onoDraftsNotice(ONOMATOPOEIA_DRAFTS.length))).toBeTruthy();
    for (const o of ONOMATOPOEIA_DRAFTS.slice(0, 3)) {
      expect(screen.getByText(o.surface)).toBeTruthy();
    }
  });
  it('展開すると意味・例文2・誤りやすい点・問題・会話が表示される', () => {
    render(<OnoDraftsPanel t={t} onBack={() => {}} />);
    fireEvent.click(screen.getByText('あたふた'));
    const o = ONOMATOPOEIA_DRAFTS[0];
    expect(screen.getByText(o.meaningJa)).toBeTruthy();
    expect(screen.getByText(o.examples[0].ja)).toBeTruthy();
    expect(screen.getByText(o.examples[1].ja)).toBeTruthy();
    expect(screen.getByText('⚠ ' + o.commonMistakeZh)).toBeTruthy();
  });
  it('戻るボタンでonBackが呼ばれる（dead endなし）', () => {
    let backed = false;
    render(<OnoDraftsPanel t={t} onBack={() => { backed = true; }} />);
    fireEvent.click(screen.getByText(t.roadmap.back));
    expect(backed).toBe(true);
  });
});
