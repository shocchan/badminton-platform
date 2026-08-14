// 問題報告（§18）とプライバシー操作（§13）のAPI。
//
// 報告に自動添付するのは調査に必要な最小限のみ。
// APIキー・OTP・発話本文・メールアドレスは送らない。

import { supabase } from '../../../services/supabaseClient';

export interface IssueReportInput {
  learnerId: string | null;
  sessionId: string | null;
  errorCode: string | null;
  comment: string;
}

/** ブラウザ・OSの概要（詳細な指紋情報は集めない） */
const environmentInfo = (): { userAgent: string; platform: string; online: boolean } => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return {
    // UAは長すぎると読みにくいので切り詰める
    userAgent: ua.slice(0, 300),
    platform: typeof navigator !== 'undefined' ? (navigator.platform ?? '') : '',
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  };
};

export const submitIssueReport = async (input: IssueReportInput): Promise<boolean> => {
  const env = environmentInfo();
  // 保存＋運営への通知メールを Edge Function 側で一括で行う
  // （旧: クライアントからINSERTのみ→通知が無く運営が気づけなかった。2026-08-15修正）。
  // 報告者が誰かはサーバーがJWTから導出する。通知まで成功して初めて「送信しました」と言う
  const { data, error } = await supabase.functions.invoke('notify-issue-report', {
    body: {
      sessionId: input.sessionId,
      errorCode: input.errorCode,
      comment: input.comment.slice(0, 1000),
      page: typeof location !== 'undefined' ? location.pathname : '',
      userAgent: env.userAgent,
      platform: env.platform,
      online: env.online,
    },
  });
  return !error && (data as { ok?: boolean } | null)?.ok === true;
};

/** 自分の発話ログ（文字起こし）を削除する。レポート・進捗は残る */
export const deleteMyUtterances = async (): Promise<{ ok: boolean; deleted: number }> => {
  const { data, error } = await supabase.rpc('ai_delete_my_utterances');
  if (error) return { ok: false, deleted: 0 };
  return { ok: true, deleted: typeof data === 'number' ? data : 0 };
};
