// 問い合わせ（contacts）を管理画面から見える状態にする（2026-08-24）。
//
// 【なぜ作るか】
// /contact フォームは動いていて本番DBに行が溜まっているのに、
// src 全体を探しても contacts を「読む」コードが1件も無かった。
// 結果、status='new' のまま最古 2026-07-06 から滞留していた。
// 送信された問い合わせが誰の目にも触れないのが、いま一番まずい。
//
// 【なぜRPC経由か】
// contacts の SELECT/UPDATE は 20260824120000 のマイグレーションで
// is_admin() 限定に締め、テーブルへの直接権限を外した。読み書きは
// admin_list_contacts / admin_set_contact_status（どちらも is_admin() ガード）に一本化する。
//
// このモジュールはメールを送らない。表示と状態変更だけを行う。

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';

export type ContactStatus = 'new' | 'replied' | 'closed';

export interface Contact {
  id: string;
  created_at: string;
  name: string;
  email: string;
  category: string;
  message: string;
  lang: string;
  status: ContactStatus;
}

export const CATEGORY_LABEL: Record<string, string> = {
  activity: '通常活動',
  tournament: '大会',
  sponsor: 'スポンサー',
  other: 'その他',
};
export const categoryLabel = (c: string): string => CATEGORY_LABEL[c] ?? c;

export const STATUS_LABEL: Record<ContactStatus, string> = {
  new: '未返信',
  replied: '返信済み',
  closed: '対応完了',
};

/** 受信からの経過日数（当日は0）。 */
export const daysSince = (iso: string, now: Date = new Date()): number => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  const d = new Date(t);
  const from = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const to = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((to - from) / 86400000));
};

export const isUnreplied = (c: Contact): boolean => c.status === 'new';

export const unrepliedContacts = (list: Contact[]): Contact[] => list.filter(isUnreplied);

/**
 * 画面に並べる順番。
 * 未返信を先に、そのなかは「古いものほど上」。放置が長いものから手を打つため。
 * 返信済み・対応完了は新しい順で後ろに置く。
 */
export const sortForBoard = (list: Contact[]): Contact[] => {
  const time = (c: Contact) => Date.parse(c.created_at) || 0;
  return [...list].sort((a, b) => {
    const au = isUnreplied(a) ? 0 : 1;
    const bu = isUnreplied(b) ? 0 : 1;
    if (au !== bu) return au - bu;
    return au === 0 ? time(a) - time(b) : time(b) - time(a);
  });
};

/** 未返信のうち一番古いものの経過日数。未返信ゼロなら null。 */
export const oldestUnrepliedDays = (list: Contact[], now: Date = new Date()): number | null => {
  const days = unrepliedContacts(list).map(c => daysSince(c.created_at, now));
  return days.length === 0 ? null : Math.max(...days);
};

export const fetchContacts = async (): Promise<Contact[]> => {
  const { data, error } = await supabase.rpc('admin_list_contacts');
  if (error) throw error;
  return (data || []) as Contact[];
};

export const setContactStatus = async (id: string, status: ContactStatus): Promise<void> => {
  const { error } = await supabase.rpc('admin_set_contact_status', { p_id: id, p_status: status });
  if (error) throw error;
};

export interface UseContactsResult {
  contacts: Contact[];
  loading: boolean;
  /** RPC未適用などで読めなかった場合。画面は黙って引っ込む。 */
  unavailable: boolean;
  unrepliedCount: number;
  oldestDays: number | null;
  refresh: () => Promise<void>;
  updateStatus: (id: string, status: ContactStatus) => Promise<void>;
}

/** 管理画面のどのタブにいても未返信件数を出せるよう、AdminPage 側で1回だけ読む。 */
export const useContacts = (enabled: boolean): UseContactsResult => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setContacts(await fetchContacts());
      setUnavailable(false);
    } catch (err) {
      console.error('contacts fetch failed', err);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  const updateStatus = useCallback(async (id: string, status: ContactStatus) => {
    await setContactStatus(id, status);
    setContacts(prev => prev.map(c => (c.id === id ? { ...c, status } : c)));
  }, []);

  return {
    contacts,
    loading,
    unavailable,
    unrepliedCount: unrepliedContacts(contacts).length,
    oldestDays: oldestUnrepliedDays(contacts),
    refresh,
    updateStatus,
  };
};
