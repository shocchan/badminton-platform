// AIレッスンの「集中モード」制御
// レッスン中だけ共通ヘッダー・フッターを隠し、会話に集中できる全画面レイアウトにする。
// 既存の一般ページには影響しない（デフォルト false。AIレッスン画面だけが true にする）。

import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface LessonFocusValue {
  focused: boolean;
  setFocused: (v: boolean) => void;
}

const LessonFocusContext = createContext<LessonFocusValue>({
  focused: false,
  setFocused: () => {},
});

export const LessonFocusProvider = ({ children }: { children: ReactNode }) => {
  const [focused, setFocused] = useState(false);
  const value = useMemo(() => ({ focused, setFocused }), [focused]);
  return <LessonFocusContext.Provider value={value}>{children}</LessonFocusContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components -- 既存のLanguageContextと同じ「Provider+フック同居」パターン
export const useLessonFocus = () => useContext(LessonFocusContext);
