// 共通トースト通知。ToastProvider を App 直下に置き、useToast() で
// toast.success('保存しました') のように呼ぶ。alert() の置き換え先。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  leaving: boolean;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

// Provider外（イベントハンドラ内の深い場所など）からも使えるブリッジ。
// ToastProviderがマウントされていない場合はalertにフォールバックする。
let globalToast: ToastApi | null = null;
export const toast: ToastApi = {
  success: (m) => (globalToast ? globalToast.success(m) : window.alert(m)),
  error: (m) => (globalToast ? globalToast.error(m) : window.alert(m)),
  info: (m) => (globalToast ? globalToast.info(m) : window.alert(m)),
};

const KIND_STYLE: Record<ToastKind, { icon: typeof Info; accent: string }> = {
  success: { icon: CheckCircle2, accent: 'text-emerald-500' },
  error: { icon: AlertCircle, accent: 'text-red-500' },
  info: { icon: Info, accent: 'text-blue-500' },
};

const AUTO_DISMISS_MS = 4000;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) =>
      list.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    );
    // フェードアウト後に除去
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 250);
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, kind, message, leaving: false }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  // グローバルブリッジへ登録（アンマウント時に解除）
  useEffect(() => {
    globalToast = api;
    return () => {
      globalToast = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* トースト表示レイヤー */}
      <div
        className="pointer-events-none fixed inset-x-0 top-16 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const { icon: Icon, accent } = KIND_STYLE[t.kind];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-lg transition-all duration-250 ${
                t.leaving ? 'translate-y-1 opacity-0' : 'toast-enter opacity-100'
              }`}
              role="status"
            >
              <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${accent}`} strokeWidth={2.25} />
              <p className="flex-1 text-sm font-medium leading-snug text-gray-800">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="-m-1 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast は ToastProvider の内側で使ってください');
  return ctx;
}
