// @vitest-environment jsdom
// 問い合わせの可視化（2026-08-24）。
//
// /contact フォームは動いていたのに、contacts を読むコードが src に1件も無く、
// status='new' のまま最古 2026-07-06 から5件が滞留していた。
// 「古いものほど上」「何日放置しているか」「無いときは言い切る」を機械で固定する。
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ContactsPanel from './ContactsPanel';
import {
  categoryLabel,
  daysSince,
  oldestUnrepliedDays,
  sortForBoard,
  unrepliedContacts,
  type Contact,
} from './adminContacts';

afterEach(cleanup);

const c = (over: Partial<Contact> = {}): Contact => ({
  id: 'id-1',
  created_at: '2026-08-24T01:00:00Z',
  name: '問合 太郎',
  email: 'toi@example.com',
  category: 'tournament',
  message: '大会に参加したいです',
  lang: 'ja',
  status: 'new',
  ...over,
});

describe('滞留の見え方', () => {
  const now = new Date('2026-08-24T12:00:00+09:00');

  it('経過日数を数える（当日は0）', () => {
    expect(daysSince('2026-08-24T01:00:00Z', now)).toBe(0);
    expect(daysSince('2026-07-06T01:00:00Z', now)).toBe(49);
  });

  it('未返信だけを数える', () => {
    const list = [c({ id: 'a' }), c({ id: 'b', status: 'replied' }), c({ id: 'c', status: 'closed' })];
    expect(unrepliedContacts(list).map(x => x.id)).toEqual(['a']);
  });

  it('一番古い未返信の経過日数を出す（返信済みは無視する）', () => {
    const list = [
      c({ id: 'a', created_at: '2026-08-20T00:00:00Z' }),
      c({ id: 'b', created_at: '2026-07-06T00:00:00Z' }),
      c({ id: 'old-but-done', created_at: '2026-01-01T00:00:00Z', status: 'closed' }),
    ];
    expect(oldestUnrepliedDays(list, now)).toBe(49);
  });

  it('未返信がゼロなら null（＝バナーを出さない）', () => {
    expect(oldestUnrepliedDays([c({ status: 'replied' })], now)).toBeNull();
  });
});

describe('並び順', () => {
  it('未返信が先。そのなかは古いものほど上', () => {
    const list = [
      c({ id: 'new-recent', created_at: '2026-08-22T00:00:00Z' }),
      c({ id: 'done', created_at: '2026-08-23T00:00:00Z', status: 'replied' }),
      c({ id: 'new-old', created_at: '2026-07-06T00:00:00Z' }),
    ];
    expect(sortForBoard(list).map(x => x.id)).toEqual(['new-old', 'new-recent', 'done']);
  });
});

describe('カテゴリ表記', () => {
  it('日本語に直す。知らない値はそのまま出す', () => {
    expect(categoryLabel('sponsor')).toBe('スポンサー');
    expect(categoryLabel('unknown')).toBe('unknown');
  });
});

const noop = async () => {};

describe('ContactsPanel', () => {
  it('未返信を本文つきで出し、状態変更の操作を並べる', () => {
    render(
      <ContactsPanel
        contacts={[c({ message: '大会に参加したいです' })]}
        loading={false}
        unavailable={false}
        onUpdateStatus={noop}
        onRefresh={noop}
      />
    );
    expect(screen.getByText('問合 太郎')).toBeTruthy();
    expect(screen.getByText('toi@example.com')).toBeTruthy();
    expect(screen.getByText('大会に参加したいです')).toBeTruthy();
    expect(screen.getByRole('button', { name: '返信済みにする' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '対応完了にする' })).toBeTruthy();
  });

  it('無いときは「ありません」と言い切る（空の枠を並べない）', () => {
    render(
      <ContactsPanel
        contacts={[c({ status: 'replied' })]}
        loading={false}
        unavailable={false}
        onUpdateStatus={noop}
        onRefresh={noop}
      />
    );
    expect(screen.getByText('未返信の問い合わせはありません')).toBeTruthy();
  });

  it('連絡先はメーラーを開くリンクだけ。自動送信のボタンは置かない', () => {
    const { container } = render(
      <ContactsPanel
        contacts={[c()]}
        loading={false}
        unavailable={false}
        onUpdateStatus={noop}
        onRefresh={noop}
      />
    );
    expect(container.querySelector('a[href="mailto:toi@example.com"]')).toBeTruthy();
    for (const b of Array.from(container.querySelectorAll('button'))) {
      expect(b.textContent ?? '').not.toMatch(/送信|メールを送/);
    }
  });

  it('RPCが読めないときは黙って壊れず、原因を書いて出す', () => {
    render(
      <ContactsPanel contacts={[]} loading={false} unavailable={true} onUpdateStatus={noop} onRefresh={noop} />
    );
    expect(screen.getByText(/admin_list_contacts/)).toBeTruthy();
  });
});

describe('取得経路', () => {
  const src = readFileSync(join(__dirname, 'adminContacts.ts'), 'utf8');

  it('contacts テーブルを直接読まず、管理者用RPC経由にする', () => {
    expect(src).toContain("supabase.rpc('admin_list_contacts')");
    expect(src).toContain("supabase.rpc('admin_set_contact_status'");
    expect(src, 'contacts への直接アクセスが残っている').not.toContain("from('contacts')");
  });

  it('メール送信をしない（表示と状態変更だけ）', () => {
    expect(src).not.toMatch(/notify-contact|functions\/v1|sendMail|resend/i);
  });
});
