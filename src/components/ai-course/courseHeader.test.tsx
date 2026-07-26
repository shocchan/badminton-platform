// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CourseHeader } from './CourseHeader';
import { aiCourseI18n } from '../../locales/aiCourse';

afterEach(cleanup);
const t = aiCourseI18n.ja;
const base = { t, showNav: true, onNavigate: () => {}, onLogout: () => {}, lang: 'ja' as const, onToggleLang: () => {} };

describe('ヘッダーの「日本語のしくみ」主要ナビ（§1）', () => {
  it('showLab=trueで表示（デスクトップ＋モバイル両ナビ）・ことば→しくみの順でロードマップの次に位置', () => {
    render(<CourseHeader {...base} showLab />);
    expect(screen.getAllByText(t.nav.lab).length).toBe(2); // lg用＋モバイル用
    expect(screen.getAllByText(t.nav.vocab).length).toBe(2);
    // 表示順: roadmap の次
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    const navLabels = labels.filter((l) => Object.values(t.nav).some((v) => l?.includes(v)));
    expect(navLabels.join(',')).toContain(`${t.nav.roadmap},${t.nav.vocab},${t.nav.lab},${t.nav.history}`);
  });
  it('showLab=false（一般受講生・Andyさん）ではDOM自体を出さない', () => {
    render(<CourseHeader {...base} />);
    expect(screen.queryByText(t.nav.lab)).toBeNull();
  });
  it('現在地がaria-currentで明確・クリックでonNavigate(lab)発火', () => {
    const onNav = vi.fn();
    render(<CourseHeader {...base} showLab current="lab" onNavigate={onNav} />);
    const btns = screen.getAllByText(t.nav.lab);
    expect(btns[0].closest('button')?.getAttribute('aria-current')).toBe('page');
    fireEvent.click(btns[0]);
    expect(onNav).toHaveBeenCalledWith('lab');
  });
  it('zhは「日语基础」（直訳の実験室名ではない）', () => {
    const tz = aiCourseI18n.zh;
    render(<CourseHeader {...base} t={tz} showLab />);
    expect(screen.getAllByText('日语基础').length).toBe(2);
    expect(screen.queryByText('日语构造实验室')).toBeNull();
  });
});
