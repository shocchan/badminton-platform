// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CourseHeader } from './CourseHeader';
import { aiCourseI18n } from '../../locales/aiCourse';

afterEach(cleanup);
const t = aiCourseI18n.ja;
const base = { t, showNav: true, onNavigate: () => {}, onLogout: () => {}, lang: 'ja' as const, onToggleLang: () => {} };

describe('ヘッダーの「日本語のしくみ」主要ナビ（§1）', () => {
  it('showLab=true（案A）: ホーム/ことば/しくみ/成長/設定の5項目・ロードマップと記録は成長へ統合', () => {
    render(<CourseHeader {...base} showLab />);
    expect(screen.getAllByText(t.nav.lab).length).toBe(2); // lg用＋モバイル用
    expect(screen.getAllByText(t.nav.vocab).length).toBe(2);
    expect(screen.queryByText(t.nav.roadmap)).toBeNull(); // 成長内サブリンクへ（旧URLは維持）
    expect(screen.queryByText(t.nav.history)).toBeNull();
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    const navLabels = labels.filter((l) => Object.values(t.nav).some((v2) => l?.includes(v2)));
    expect(navLabels.join(',')).toContain(`${t.nav.home},${t.nav.vocab},${t.nav.lab},${t.nav.growth}`);
  });
  it('一般受講生（showLab=false）は従来の5項目のまま（ロードマップ・記録あり）', () => {
    render(<CourseHeader {...base} />);
    expect(screen.getAllByText(t.nav.roadmap).length).toBe(2);
    expect(screen.getAllByText(t.nav.history).length).toBe(2);
    expect(screen.queryByText(t.nav.vocab)).toBeNull();
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
