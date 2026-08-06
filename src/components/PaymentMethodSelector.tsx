import type { PaymentMethod } from '../lib/payment';
import { getEntryTexts } from '../locales/entry';

interface PaymentMethodSelectorProps {
  entryFee: number;
  paypayId?: string;
  bankAccount?: string;
  creditAvailable: boolean;
  /** 追加受付中はオンラインのクレジットカード決済のみ表示する */
  creditOnly?: boolean;
  selected: PaymentMethod | null;
  onSelect: (method: PaymentMethod) => void;
  disabled?: boolean;
  lang: string;
}

export const PaymentMethodSelector = ({
  entryFee, paypayId, bankAccount, creditAvailable, creditOnly, selected, onSelect, disabled, lang,
}: PaymentMethodSelectorProps) => {
  const t = getEntryTexts(lang);

  const options: Array<{
    method: PaymentMethod;
    icon: string;
    title: string;
    subtitle: string;
    feeLabel: string;
    totalLabel: string;
    recommended?: boolean;
    available: boolean;
  }> = [
    {
      method: 'credit',
      icon: '💳',
      title: t.pmCredit,
      subtitle: t.pmCreditSub,
      feeLabel: t.pmFeeFree,
      totalLabel: `¥${entryFee.toLocaleString()}`,
      recommended: true,
      available: creditAvailable,
    },
    {
      method: 'paypay',
      icon: '📱',
      title: t.pmPaypay,
      subtitle: paypayId ? t.pmPaypaySub(paypayId) : t.pmPaypaySubNoId,
      feeLabel: t.pmFeeFree,
      totalLabel: `¥${entryFee.toLocaleString()}`,
      available: !creditOnly && !!paypayId,
    },
    {
      method: 'bank',
      icon: '🏦',
      title: t.pmBank,
      subtitle: t.pmBankSub,
      feeLabel: t.pmBankFee,
      totalLabel: `¥${entryFee.toLocaleString()}`,
      available: !creditOnly && !!bankAccount,
    },
  ];

  const visibleOptions = options.filter(o => o.available);

  // 追加受付中はカード決済しか選べないため、その決済が使えない状態だと選択肢が0件になる。
  // 空の選択欄を出すと利用者が詰まるので、運営に連絡してもらう案内に切り替える
  if (visibleOptions.length === 0) {
    return (
      <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
        {t.pmUnavailable}
      </div>
    );
  }

  return (
    <>
    {creditOnly && (
      <p className="text-sm font-bold text-blue-900 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-3">
        💳 {t.lateCreditOnly}
      </p>
    )}
    <div role="radiogroup" aria-label={t.pmGroupLabel} className={`grid grid-cols-1 gap-3 ${creditOnly ? '' : 'md:grid-cols-3'}`}>
      {visibleOptions.map(opt => {
        const isSelected = selected === opt.method;
        return (
          <button
            key={opt.method}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={t.pmAria(opt.title, opt.totalLabel)}
            disabled={disabled}
            onClick={() => onSelect(opt.method)}
            className={`relative text-left border-2 rounded-xl p-4 transition-all duration-150 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:hover:scale-100 ${
              isSelected
                ? 'border-blue-600 bg-blue-50 shadow-md'
                : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300'
            }`}
          >
            {opt.recommended && (
              <span className="absolute -top-2.5 left-3 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {t.pmRecommended}
              </span>
            )}
            <div className="flex items-center gap-2 mb-1.5">
              <span aria-hidden="true" className="text-xl">{opt.icon}</span>
              <span className="font-bold text-sm text-gray-900">{opt.title}</span>
              {isSelected && (
                <span aria-hidden="true" className="ml-auto w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">✓</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-2">{opt.subtitle}</p>
            <p className="text-xs text-gray-500">{opt.feeLabel}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">
              {opt.totalLabel}
              <span className="text-xs font-normal text-gray-400 ml-1">{t.pmAmount}</span>
            </p>
          </button>
        );
      })}
    </div>
    </>
  );
};
