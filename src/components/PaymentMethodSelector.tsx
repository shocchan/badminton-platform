import type { PaymentMethod } from '../lib/payment';
import { calcCreditAmounts } from '../lib/payment';

interface PaymentMethodSelectorProps {
  entryFee: number;
  paypayId?: string;
  bankAccount?: string;
  creditAvailable: boolean;
  selected: PaymentMethod | null;
  onSelect: (method: PaymentMethod) => void;
  disabled?: boolean;
}

export const PaymentMethodSelector = ({
  entryFee, paypayId, bankAccount, creditAvailable, selected, onSelect, disabled,
}: PaymentMethodSelectorProps) => {
  const { fee, total } = calcCreditAmounts(entryFee);

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
      title: 'クレジットカード',
      subtitle: 'Visa / Mastercard / AmEx ほか',
      feeLabel: `決済手数料: ¥${fee.toLocaleString()}（3.6%）`,
      totalLabel: `¥${total.toLocaleString()}`,
      recommended: true,
      available: creditAvailable,
    },
    {
      method: 'paypay',
      icon: '📱',
      title: 'PayPay',
      subtitle: paypayId ? `PayPay ID: ${paypayId}` : 'PayPay IDに送金',
      feeLabel: '手数料: ¥0',
      totalLabel: `¥${entryFee.toLocaleString()}`,
      available: !!paypayId,
    },
    {
      method: 'bank',
      icon: '🏦',
      title: '銀行振込',
      subtitle: '振込先はメールでご案内',
      feeLabel: '手数料: ¥0（振込手数料はご負担ください）',
      totalLabel: `¥${entryFee.toLocaleString()}`,
      available: !!bankAccount,
    },
  ];

  const visibleOptions = options.filter(o => o.available);

  return (
    <div role="radiogroup" aria-label="支払い方法" className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {visibleOptions.map(opt => {
        const isSelected = selected === opt.method;
        return (
          <button
            key={opt.method}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${opt.title} 支払額 ${opt.totalLabel}`}
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
                推奨
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
              <span className="text-xs font-normal text-gray-400 ml-1">お支払い額</span>
            </p>
          </button>
        );
      })}
    </div>
  );
};
