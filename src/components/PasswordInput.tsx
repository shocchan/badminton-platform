import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showStrength?: boolean;
}

interface StrengthInfo {
  level: 'weak' | 'medium' | 'strong';
  score: number;
  color: string;
  text: string;
}

const strengthTexts = {
  ja: { weak: '弱 - もっと複雑にしてください', medium: '中程度 - 良好です', strong: '強い - 安全です', shortPassword: 'パスワードは6文字以上にしてください' },
  zh: { weak: '弱 - 请增加复杂度', medium: '中等 - 很好', strong: '强 - 安全', shortPassword: '密码必须至少6个字符' },
};

const calculateStrength = (password: string, lang: 'ja' | 'zh' = 'ja'): StrengthInfo => {
  let score = 0;
  const checks = {
    length: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  Object.values(checks).forEach(check => {
    if (check) score += 1;
  });

  if (score <= 2) {
    return { level: 'weak', score, color: 'bg-red-500', text: strengthTexts[lang].weak };
  } else if (score <= 3) {
    return { level: 'medium', score, color: 'bg-yellow-500', text: strengthTexts[lang].medium };
  } else {
    return { level: 'strong', score, color: 'bg-green-500', text: strengthTexts[lang].strong };
  }
};

export const PasswordInput = ({
  value,
  onChange,
  placeholder = '••••••••',
  showStrength = true,
}: PasswordInputProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const { lang } = useLanguage();
  const strength = calculateStrength(value, lang as 'ja' | 'zh');
  const isPasswordSet = value.length > 0;

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          minLength={6}
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
          title={showPassword ? 'パスワードを非表示' : 'パスワードを表示'}
        >
          {showPassword ? '👁️' : '🔒'}
        </button>
      </div>

      {showStrength && isPasswordSet && (
        <div className="space-y-1">
          <div className="flex gap-1 h-1 rounded-full overflow-hidden bg-gray-200">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`flex-1 transition-all ${
                  i < strength.score ? strength.color : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-600">{strength.text}</p>
        </div>
      )}

      {isPasswordSet && value.length < 6 && (
        <p className="text-xs text-red-500">{strengthTexts[lang].shortPassword}</p>
      )}
    </div>
  );
};
