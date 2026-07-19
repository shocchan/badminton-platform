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
  const { error } = await supabase.from('ai_issue_reports').insert({
    learner_id: input.learnerId,
    session_id: input.sessionId,
    page: typeof location !== 'undefined' ? location.pathname : '',
    error_code: input.errorCode,
    user_agent: env.userAgent,
    platform: env.platform,
    online: env.online,
    comment: input.comment.slice(0, 1000),
  });
  return !error;
};

/** 自分の発話ログ（文字起こし）を削除する。レポート・進捗は残る */
export const deleteMyUtterances = async (): Promise<{ ok: boolean; deleted: number }> => {
  const { data, error } = await supabase.rpc('ai_delete_my_utterances');
  if (error) return { ok: false, deleted: 0 };
  return { ok: true, deleted: typeof data === 'number' ? data : 0 };
};
