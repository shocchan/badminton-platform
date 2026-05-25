import { useState } from 'react';
import type { Tournament } from '../types';
import { supabase } from '../services/supabaseClient';

interface EntryFormProps {
  tournament: Tournament;
  onClose: () => void;
}

type Step = 'input' | 'confirm' | 'success';

export const EntryForm = ({ tournament, onClose }: EntryFormProps) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
  });
  const [step, setStep] = useState<Step>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('有効なメールアドレスを入力してください');
      return;
    }
    setError(null);
    setStep('confirm');
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('entries').insert([{
        tournament_id: tournament.id,
        ...formData,
      }]);
      if (insertError) throw insertError;
      await sendPaymentEmail(formData.email);
      setStep('success');
    } catch (err) {
      setError('申し込みに失敗しました。もう一度お試しください。');
      setStep('input');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sendPaymentEmail = async (email: string) => {
    try {
      const response = await fetch('https://jdkwijdphlkrcoiggfqw.supabase.co/functions/v1/send-payment-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: email,
          name: formData.name,
          phone: formData.phone,
          notes: formData.notes,
          tournament_title: tournament.title,
          tournament_date: tournament.event_date,
          payment_deadline: tournament.payment_deadline,
          bank_account: tournament.bank_account,
          paypay_id: tournament.paypay_id,
          payment_required: tournament.payment_required,
        }),
      });
      if (!response.ok) console.warn('Payment email sending failed, but entry was saved');
    } catch (err) {
      console.warn('Payment email sending error:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-5 rounded-t-2xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-white font-bold text-lg">大会申し込み</h2>
              <p className="text-blue-100 text-sm mt-1">{tournament.title}</p>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
          </div>
          {/* ステップインジケーター */}
          {step !== 'success' && (
            <div className="flex items-center gap-2 mt-4">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 'input' ? 'text-white' : 'text-blue-200'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 'input' ? 'bg-white text-blue-600' : 'bg-blue-400 text-white'}`}>1</span>
                入力
              </div>
              <div className="flex-1 h-px bg-blue-400" />
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 'confirm' ? 'text-white' : 'text-blue-300'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 'confirm' ? 'bg-white text-blue-600' : 'bg-blue-400/50 text-white'}`}>2</span>
                確認
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-5">
          {/* 完了画面 */}
          {step === 'success' && (
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
          )}

          {/* 確認画面 */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">以下の内容で申し込みます。よろしいですか？</p>
              <div className="bg-gray-50 rounded-xl divide-y divide-gray-200">
                <div className="bg-blue-50 rounded-t-xl px-4 py-3">
                  <p className="text-xs text-blue-600 font-medium mb-0.5">申し込み大会</p>
                  <p className="text-sm font-bold text-blue-900">{tournament.title}</p>
                  <p className="text-xs text-blue-700">{formatDate(tournament.event_date)} ｜ {tournament.location}</p>
                </div>
                {[
                  { label: 'お名前', value: formData.name },
                  { label: 'メールアドレス', value: formData.email },
                  { label: '電話番号', value: formData.phone || '未入力' },
                  { label: '備考', value: formData.notes || '未入力' },
                ].map(({ label, value }) => (
                  <div key={label} className="px-4 py-3">
                    <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                    <p className="text-sm text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 border border-gray-300 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-colors text-sm"
                >
                  ← 戻る
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                >
                  {loading ? '送信中...' : '申し込む'}
                </button>
              </div>
            </div>
          )}

          {/* 入力画面 */}
          {step === 'input' && (
            <form onSubmit={handleConfirm} className="space-y-4">
              <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
                📅 {formatDate(tournament.event_date)} ｜ 📍 {tournament.location}
              </div>
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">電話番号（任意）</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="090-1234-5678"
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
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
              >
                確認画面へ →
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
