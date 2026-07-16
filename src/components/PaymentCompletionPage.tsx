import type { Tournament } from '../types';
import { getEntryTexts } from '../locales/entry';

interface PaymentCompletionPageProps {
  tournament: Tournament;
  name: string;
  entryFee: number;
  total: number;
  paidAt: string;
  calendarUrl: string;
  warning?: boolean;
  lang: string;
  onClose: () => void;
}

export const PaymentCompletionPage = ({
  tournament, name, entryFee, total, paidAt, calendarUrl, warning, lang, onClose,
}: PaymentCompletionPageProps) => {
  const t = getEntryTexts(lang);
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const timeRange = `${tournament.start_time.slice(0, 5)}〜${tournament.end_time.slice(0, 5)}`;
  const paidAtStr = new Date(paidAt).toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const cancelDeadlineStr = formatDate((() => {
    if (tournament.cancel_deadline) return tournament.cancel_deadline;
    const d = new Date(tournament.event_date);
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  })());
  const refundAmount = (entryFee - Math.round(entryFee * 0.1)).toLocaleString();

  // 領収書: 印刷用ウィンドウを開く（ブラウザの印刷→PDF保存で利用）
  const downloadReceipt = () => {
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>領収書 - ${tournament.title}</title>
<style>
  body { font-family: -apple-system, 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif; max-width: 480px; margin: 40px auto; color: #111; padding: 0 16px; }
  h1 { font-size: 22px; text-align: center; letter-spacing: 8px; border-bottom: 2px solid #111; padding-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 24px 0; }
  td { padding: 10px 4px; border-bottom: 1px solid #ddd; font-size: 14px; }
  td:last-child { text-align: right; }
  .total td { font-weight: bold; font-size: 16px; border-bottom: 2px solid #111; }
  .meta { font-size: 13px; color: #444; line-height: 1.9; }
  .footer { margin-top: 32px; font-size: 12px; color: #888; text-align: center; }
  .print-btn { display: block; margin: 24px auto; padding: 10px 32px; font-size: 14px; cursor: pointer; }
  @media print { .print-btn { display: none; } }
</style></head><body>
<h1>領収書</h1>
<p class="meta">${name} 様</p>
<table>
  <tr class="total"><td>参加費</td><td>¥${total.toLocaleString()}</td></tr>
</table>
<p class="meta">
  但し：${tournament.title} 参加費として<br>
  支払日：${paidAtStr}<br>
  支払方法：クレジットカード
</p>
<p class="footer">川口・蕨バド交流杯（kawabado.com）<br>上記の金額を正に領収いたしました。</p>
<button class="print-btn" onclick="window.print()">印刷 / PDFとして保存</button>
</body></html>`);
    w.document.close();
  };

  return (
    <div className="text-center py-4">
      <div aria-hidden="true" className="text-6xl mb-3">✅</div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">{t.ccTitle}</h3>
      <p className="text-gray-600 text-sm mb-4">{t.ccLead}</p>

      {warning && (
        <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 rounded-xl mb-4 text-left">
          ⚠️ {t.ccWarning}
        </div>
      )}

      {/* 参加確認 */}
      <div className="bg-gray-50 rounded-xl divide-y divide-gray-200 text-left mb-4">
        <div className="bg-green-50 rounded-t-xl px-4 py-3">
          <p className="text-xs font-medium text-green-600 mb-0.5">{t.ccConfirm}</p>
          <p className="text-sm font-bold text-green-900">{tournament.title}</p>
          <p className="text-xs text-green-700">{tournament.level}</p>
        </div>
        <div className="px-4 py-3 flex justify-between items-center">
          <span className="text-xs text-gray-500">{t.ccFee}</span>
          <span className="text-sm font-bold text-gray-900">¥{total.toLocaleString()}{t.ccPaid}<span className="text-green-600">✓</span></span>
        </div>
        <div className="px-4 py-3 flex justify-between items-center">
          <span className="text-xs text-gray-500">{t.ccName}</span>
          <span className="text-sm text-gray-900">{name}</span>
        </div>
      </div>

      {/* 大会情報 */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4 text-left">
        <p className="text-sm font-bold text-blue-900 mb-2">{t.ccInfoTitle}</p>
        <p className="text-xs text-blue-800 leading-relaxed">
          {t.ccInfoDate}: {formatDate(tournament.event_date)} {timeRange}<br />
          {t.ccInfoVenue}: {tournament.location}
          {tournament.venue_address && <><br />{t.ccInfoAddress}: {tournament.venue_address}</>}
        </p>
      </div>

      {/* 当日受付の案内 */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-left">
        <p className="text-sm font-bold text-gray-700 mb-1">{t.ccCheckinTitle}</p>
        <p className="text-xs text-gray-500">{t.ccCheckinNote}</p>
      </div>

      {/* キャンセル規定 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-left">
        <p className="text-sm font-bold text-amber-800 mb-1">{t.doneCancelTitle}</p>
        <p className="text-xs text-amber-700">{t.ccCancelPolicy(cancelDeadlineStr, refundAmount)}</p>
      </div>

      {/* アクションボタン */}
      <div className="space-y-2.5">
        <a
          href={calendarUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-white border border-green-300 hover:bg-green-50 text-green-800 font-bold text-sm py-3 rounded-xl transition-colors"
        >
          📅 {t.doneCalBtn}
        </a>
        <button
          onClick={downloadReceipt}
          className="w-full bg-white border border-blue-300 hover:bg-blue-50 text-blue-700 font-bold text-sm py-3 rounded-xl transition-colors"
        >
          {t.ccReceipt}
        </button>
        <button
          onClick={onClose}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold transition-colors"
        >
          {t.close}
        </button>
      </div>
    </div>
  );
};
