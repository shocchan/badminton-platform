import { useState } from 'react';
import type { Tournament } from '../types';
import { supabase } from '../services/supabaseClient';

interface EntryFormProps {
  tournament: Tournament;
  onClose: () => void;
}

export const EntryForm = ({ tournament, onClose }: EntryFormProps) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: ''
    email: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('有効なメールアドレスを入力してください');
      setLoading(false);
      return;
    }

    try {
      // Insert entry
      const { error: insertError } = await supabase.from('entries').insert([{
        tournament_id: tournament.id,
        ...formData,
      }]);

      if (insertError) throw insertError;

      // Send payment email if payment is required
      if (tournament.payment_required) {
        await sendPaymentEmail(formData.email);
      }

      setSuccess(true);
    } catch (err) {
      setError('申し込みに失敗しました。もう一度お試しください。');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sendPaymentEmail = async (email: string) => {
    try {
      const response = await fetch('https://jdkwijdphlkrcoigqfqw.supabase.co/functions/v1/send-payment-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: email,
          tournament_title: tournament.title,
          tournament_date: tournament.event_date,
          payment_deadline: tournament.payment_deadline,
          bank_account: tournament.bank_account,
          paypay_id: tournament.paypay_id,
        }),
      });

      if (!response.ok) {
        console.warn('Payment email sending failed, but entry was saved');
      }
    } catch (err) {
      console.warn('Payment email sending error:', err);
      // Don't throw - entry is already saved
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-5 rounded-t-2xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-white font-bold text-lg">大会申し込み</h2>
              <p className="text-blue-100 text-sm mt-1">{tournament.title}</p>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
          </div>
        </div>

        <div className="px-6 py-5">
          {success ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">申し込み完了！</h3>
              <p className="text-gray-600 text-sm mb-4">
                {tournament.title}（{formatDate(tournament.event_date)}）への申し込みを受け付けました。
              </p>
              {tournament.payment_required && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
                  <p className="text-sm font-medium text-blue-900 mb-2">💳 支払い案内メールをお送りしました</p>
                  <p className="text-xs text-blue-700 mb-2">メールアドレス: {formData.email}</p>
                  <p className="text-xs text-blue-700">支払い期限: {tournament.payment_deadline ? formatDate(tournament.payment_deadline) : '未定'}</p>
                </div>
              )}
              <button
                onClick={onClose}
                className="bg-blue-600 text-white px-6 py-2 rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                閉じる
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
                📅 {formatDate(tournament.event_date)} ｜ 📍 {tournament.location}
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">お名前 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="山田 太郎"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">電話番号 <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="090-1234-5678"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="example@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考（任意）</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="ペア名など"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 rounded-xl transition-colors"
              >
                {loading ? '送信中...' : '申し込む'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
