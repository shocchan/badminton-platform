// 会員登録／ログインフォーム（ダークUI。当選モーダルとマイページで共用）。
// 成功時にこの端末のゲスト当選クーポンを自動でアカウントへ引き継ぐ。
// 一度ログインすればセッションはlocalStorageに保持され、次回以降は自動ログイン。

import { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { claimGuestCoupons, type ClaimResult } from '../services/coupons';

interface Props {
  /** 登録/ログイン＋引き継ぎ完了時に呼ばれる */
  onDone: (claim: ClaimResult) => void;
}

export default function ClaimAccountForm({ onDone }: Props) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (mode === 'register' && name.trim().length === 0) {
      setError('お名前を入力してください');
      return;
    }
    if (password.length < 6) {
      setError('パスワードは6文字以上にしてください');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'register') {
        const { error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: name.trim() } },
        });
        if (signUpErr) {
          throw new Error(
            signUpErr.message.includes('already registered')
              ? 'このメールアドレスは登録済みです。ログインに切り替えてください'
              : '登録に失敗しました。メールアドレスを確認してください',
          );
        }
      } else {
        const { error: loginErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginErr) throw new Error('メールアドレスまたはパスワードが間違っています');
        // 管理者アカウントはこの簡易ログイン（2段階認証なし）を通さない。正規のログイン画面へ誘導
        const { data: isAdmin } = await supabase.rpc('is_admin');
        if (isAdmin) {
          await supabase.auth.signOut();
          throw new Error('管理者アカウントはログインページからログインしてください');
        }
      }
      const claim = await claimGuestCoupons();
      onDone(claim);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none';

  return (
    <form onSubmit={handleSubmit} className="text-left">
      {/* 登録/ログイン切り替え */}
      <div className="flex rounded-lg bg-slate-800 p-1 text-sm font-bold">
        {(
          [
            ['register', 'はじめて（登録）'],
            ['login', 'ログイン'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-3 py-2 transition ${
              mode === m ? 'bg-emerald-500 text-white' : 'text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {mode === 'register' && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="お名前（例: 田中太郎）"
            aria-label="お名前"
            maxLength={30}
            className={inputClass}
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="メールアドレス"
          aria-label="メールアドレス"
          required
          className={inputClass}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード（6文字以上）"
          aria-label="パスワード"
          required
          minLength={6}
          className={inputClass}
        />
      </div>

      {error && <p className="mt-3 text-xs font-bold text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-4 w-full rounded-full bg-emerald-500 px-8 py-3 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
      >
        {busy ? '処理中…' : mode === 'register' ? '登録して受け取る' : 'ログインして受け取る'}
      </button>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        メールアドレスは当選連絡・本人確認のみに使用します。
        登録すると同じ端末のプレイ履歴・当選情報がアカウントに引き継がれます。
      </p>
    </form>
  );
}
