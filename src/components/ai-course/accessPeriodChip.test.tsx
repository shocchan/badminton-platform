// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AccessPeriodChip } from './AccessPeriodChip';

const at = (iso: string) => vi.setSystemTime(new Date(iso));

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('AccessPeriodChip', () => {
  it('期限が読める（手動契約の9人に、これまで何も出ていなかった穴）', () => {
    vi.useFakeTimers(); at('2026-09-09T10:00:00.000Z');
    render(<AccessPeriodChip lang="ja" validUntilISO="2026-10-09T10:00:00.000Z" />);
    expect(screen.getByText(/利用期限：/).textContent).toContain('あと30日');
  });

  it('ラベルが二重にならない（「利用期限 利用期限を過ぎました」を出さない）', () => {
    vi.useFakeTimers(); at('2026-09-09T10:00:00.000Z');
    const { container } = render(<AccessPeriodChip lang="ja" validUntilISO="2026-09-01T10:00:00.000Z" />);
    expect(container.textContent!.match(/利用期限/g)!.length).toBe(1);
  });

  it('中国語でも同じ（ラベルは1回）', () => {
    vi.useFakeTimers(); at('2026-09-09T10:00:00.000Z');
    const { container } = render(<AccessPeriodChip lang="zh" validUntilISO="2026-10-09T10:00:00.000Z" />);
    expect(container.textContent).toContain('还剩30天');
    expect(container.textContent!.match(/使用期限/g)!.length).toBe(1);
  });

  it('日付が壊れている行では何も描かない（推測した日付を出さない）', () => {
    const { container } = render(<AccessPeriodChip lang="ja" validUntilISO="" />);
    expect(container.firstChild).toBe(null);
  });
});
