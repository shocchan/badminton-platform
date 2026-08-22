// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CourseHeader } from './CourseHeader';
import { aiCourseI18n } from '../../locales/aiCourse';

afterEach(cleanup);
const t = aiCourseI18n.ja;
const base = { t, showNav: true, onNavigate: () => {}, onLogout: () => {}, lang: 'ja' as const, onToggleLang: () => {} };

describe('ヘッダーの「日本語のしくみ」主要ナビ（§1）', () => {
  it('showLab=true（案A改・2E-1 §19）: ホーム/AI会話/ことば/しくみ/成長/設定の6項目・ロードマップと記録は成長へ統合', () => {
    render(<CourseHeader {...base} showLab />);
    expect(screen.getAllByText(t.nav.lab).length).toBe(1);        // lg用（モバイルは短縮ラベル）
    expect(screen.getAllByText(t.nav.labShort).length).toBe(1);   // モバイル用短縮（§19）
    expect(screen.getAllByText(t.nav.conversation).length).toBe(2); // AI会話が主要ナビに明示（lg＋モバイル）
    expect(screen.getAllByText(t.nav.vocab).length).toBe(2);
    expect(screen.queryByText(t.nav.roadmap)).toBeNull(); // 成長内サブリンクへ（旧URLは維持）
    expect(screen.queryByText(t.nav.history)).toBeNull();
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    const navLabels = labels.filter((l) => Object.values(t.nav).some((v2) => l?.includes(v2)));
    // ことば/しくみは役割subtitle付き（2026-07-30 CEO UX指示）のため、順序と包含で検証
    const joined = navLabels.join(',');
    for (const label of [t.nav.home, t.nav.conversation, t.nav.vocab, t.nav.lab, t.nav.growth]) {
      expect(joined).toContain(label);
    }
    expect(joined).toContain(t.hubRoles.vocabNavSub); // ことばのsubtitle
    expect(joined).toContain(t.hubRoles.labNavSub);   // しくみのsubtitle
  });
  it('モバイル案A（2E-1.5 §16）: 主要4項目＋その他シート（成長・設定）・Escapeで閉じる', () => {
    const onNav = vi.fn();
    render(<CourseHeader {...base} showLab onNavigate={onNav} />);
    // その他を開くと成長・設定が出る
    const more = screen.getByText(t.nav.more);
    expect(more.closest('button')?.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(more.closest('button')?.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain(t.nav.growth);
    expect(menu.textContent).toContain(t.nav.settings);
    fireEvent.click(screen.getAllByText(t.nav.growth).find((el) => el.closest('[role=menu]'))!);
    expect(onNav).toHaveBeenCalledWith('growth');
    // Escapeで閉じる
    fireEvent.click(screen.getByText(t.nav.more));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    // 一般受講生ナビに「その他」は無い
    cleanup();
    render(<CourseHeader {...base} />);
    expect(screen.queryByText(t.nav.more)).toBeNull();
  });
  it('AI会話ナビはonNavigate(conversation)を発火・一般受講生には出ない', () => {
    const onNav = vi.fn();
    render(<CourseHeader {...base} showLab onNavigate={onNav} />);
    fireEvent.click(screen.getAllByText(t.nav.conversation)[0]);
    expect(onNav).toHaveBeenCalledWith('conversation');
    cleanup();
    render(<CourseHeader {...base} />);
    expect(screen.queryByText(t.nav.conversation)).toBeNull();
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
  it('zhは「日语基础」（直訳の実験室名ではない）・モバイルは短縮「基础」', () => {
    const tz = aiCourseI18n.zh;
    render(<CourseHeader {...base} t={tz} showLab />);
    expect(screen.getAllByText('日语基础').length).toBe(1);
    expect(screen.getAllByText('基础').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('日语构造实验室')).toBeNull();
  });
});

describe('V2入場画面のナビ（navHidden）', () => {
  it('**タブを1つも出さない**（冒険を始める前に旧コースへ迷い込ませない）', () => {
    render(<CourseHeader {...base} showLab navHidden />);
    for (const key of ['home', 'conversation', 'vocab', 'lab', 'growth', 'roadmap', 'history'] as const) {
      expect(screen.queryByText(t.nav[key]), key).toBeNull();
    }
  });

  it('ログアウトと言語切替は残す（ログイン済みの人を閉じ込めない）', () => {
    render(<CourseHeader {...base} showLab navHidden lang="ja" onToggleLang={() => {}} />);
    expect(screen.getByText(t.login.logout)).toBeTruthy();
    expect(screen.getByText('中文')).toBeTruthy();
  });

  it('navHiddenを付けなければ従来どおりタブが出る', () => {
    render(<CourseHeader {...base} showLab />);
    expect(screen.getAllByText(t.nav.growth).length).toBeGreaterThan(0);
  });
});

// ── どのアカウントの画面か・どこからでもログアウトできるか（2026-08-22 CEO実機報告） ──
//
// 報告: 名前を入れるだけの入口（CourseNameOnlyHearing）にログアウトが無く、
// 管理者が生徒のアカウントを次々に開くと**いま誰の画面か分からなくなる**。
describe('アカウント表示とログアウト', () => {
  it('ナビが無い画面（名前入力など）でもログアウトを出す', () => {
    const onLogout = vi.fn();
    render(<CourseHeader t={t} lang="ja" onToggleLang={() => {}} onLogout={onLogout} />);
    const btn = screen.getByRole('button', { name: new RegExp(t.login.logout) });
    fireEvent.click(btn);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('ログアウトを渡さない画面（ログイン前）には出さない', () => {
    render(<CourseHeader t={t} lang="ja" onToggleLang={() => {}} />);
    expect(screen.queryByRole('button', { name: new RegExp(t.login.logout) })).toBeNull();
  });

  it('アカウント名を出す（全文は title に入れる）', () => {
    render(<CourseHeader {...base} accountLabel="jlpt" />);
    const el = screen.getByTitle('jlpt');
    expect(el.textContent).toBe('jlpt');
  });

  it('accountLabel が無ければ何も出さない', () => {
    const { container } = render(<CourseHeader {...base} />);
    expect(container.querySelector('[title]')).toBeNull();
  });
});
