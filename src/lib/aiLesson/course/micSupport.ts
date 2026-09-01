// マイクが使える環境かを、時計を動かす前に確かめる（2026-09-01）。
//
// 【なぜ要るか】
// 600円の体験の中心はAI音声会話で、マイクが使えないと何も起きない。
// ところが確認しているのは**会話画面に入ってから**で、そのときには
// もう「体験を始める」を押していて7日の時計が動いている。
// 買った人が、話せないまま期間を消費することになる。
//
// 【なぜ「WeChatだから駄目」と書かないか】
// 調べた結果、WeChat内蔵ブラウザでも getUserMedia は使えることがある。
// 効くのはブラウザの名前ではなく次の3つ:
//   - HTTPS（安全なコンテキスト）であること
//   - navigator.mediaDevices.getUserMedia が存在すること
//   - iOSはOSが新しいこと（古い端末では出ない）
// 名前で決めつけると、使える人にまで警告を出して離脱させる。
// **実際に見て判断する。**
//
// 【許可ダイアログを出さない】
// ここでは getUserMedia を呼ばない。呼ぶと許可を求める窓が出て、
// まだ会話を始めていない人を驚かせる。存在と安全コンテキストだけを見る。
// 本当に許可が下りるかは、会話を始めたときに分かる（既存の mic-denied 処理が受ける）。

/** マイクまわりの環境。ok 以外は、そのままでは会話ができない */
export type MicSupport =
  /** 使える見込み。実際に許可が下りるかは会話開始時に分かる */
  | 'ok'
  /** HTTPSでない。ブラウザが仕様上マイクを渡さない */
  | 'insecure'
  /** この画面にマイクの窓口が無い。古いブラウザやアプリ内ブラウザで起きる */
  | 'unsupported';

/** 判定の純関数（テスト対象）。実行環境を引数で受ける */
export const micSupportOf = (env: {
  secure: boolean;
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
}): MicSupport => {
  if (!env.secure) return 'insecure';
  if (!env.hasMediaDevices || !env.hasGetUserMedia) return 'unsupported';
  return 'ok';
};

/** いまの画面のマイク環境。参照できないときは ok に倒す（使える人を止めない） */
export const micSupport = (): MicSupport => {
  try {
    const md = navigator.mediaDevices as MediaDevices | undefined;
    return micSupportOf({
      // isSecureContext が無い古い環境では、プロトコルで見る
      secure: typeof window.isSecureContext === 'boolean'
        ? window.isSecureContext
        : window.location.protocol === 'https:',
      hasMediaDevices: !!md,
      hasGetUserMedia: typeof md?.getUserMedia === 'function',
    });
  } catch {
    return 'ok';
  }
};

/**
 * アプリ内ブラウザ（WeChat・LINE）で開いているか。
 *
 * これ単体では警告を出さない。**マイクが使えないと分かったときに、
 * 何をすればいいかを具体的に言うため**に使う
 * （「右上の…からブラウザで開く」はアプリ内ブラウザにしか無い操作）。
 *
 * 判定が2か所に散っていたのでここへ寄せた
 * （CourseVoiceLesson と VoiceLessonChat が別々に持っていた）。
 */
export const inAppBrowser = (): 'wechat' | 'line' | null => {
  try {
    const ua = navigator.userAgent;
    if (/MicroMessenger/i.test(ua)) return 'wechat';
    if (/\bLine\//i.test(ua)) return 'line';
    return null;
  } catch {
    return null;
  }
};

/** 旧来の呼び名。既存の画面がこれを使っている */
export const isWeChat = (): boolean => inAppBrowser() === 'wechat';
