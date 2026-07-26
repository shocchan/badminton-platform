// テキスト会話の端末間再開＋読み仮名の安全表示（純関数・テスト可能）。
//
// - 別端末で in_progress のテキストセッションを、保存済み発話から復元する
//   （msgs・学習者ターン数・出題済み質問・closing段階を再構築）
// - readingAids は構造化データ→セグメント分解で表示する
//   （LLMが返した文字列をHTMLとして描画しない＝注入対策）

import { TEXT_MAX_TURNS_DEFAULT } from './courseTextTurn';
import type { ChatConvState } from './courseChatTurn';

export interface ReadingAid { text: string; reading: string; }

/** ruby表示用セグメント。reading が無い部分は通常テキスト */
export interface TextSegment { text: string; reading?: string; }

/**
 * 本文を readingAids で分割し、<ruby> レンダリング用のセグメント列にする。
 * - 同じ語には最初の1回だけ読みを付ける（何度も付けない）
 * - LLM出力はプレーン文字列として扱う（dangerouslySetInnerHTML不使用の前提部品）
 */
export const segmentWithReadings = (text: string, aids: ReadingAid[]): TextSegment[] => {
  const valid = (aids ?? []).filter((a) => a.text && a.reading && text.includes(a.text)).slice(0, 3);
  if (valid.length === 0) return [{ text }];
  let segments: TextSegment[] = [{ text }];
  for (const aid of valid) {
    let applied = false; // 同じ語は最初の1回だけ
    segments = segments.flatMap((seg) => {
      if (seg.reading || applied) return [seg];
      const i = seg.text.indexOf(aid.text);
      if (i < 0) return [seg];
      applied = true;
      const out: TextSegment[] = [];
      if (i > 0) out.push({ text: seg.text.slice(0, i) });
      out.push({ text: aid.text, reading: aid.reading });
      if (i + aid.text.length < seg.text.length) out.push({ text: seg.text.slice(i + aid.text.length) });
      return out;
    });
  }
  return segments;
};

/** 先生の過去発話から「出題済みの質問」を復元する（？で終わる末尾文・最大10件） */
export const deriveAskedQuestions = (tutorTexts: string[]): string[] => {
  const asked: string[] = [];
  for (const t of tutorTexts) {
    // 発話内の「？」で終わる文を質問として抽出（最後の1つで十分）
    const sentences = t.split(/(?<=[。！!？?])/).map((s) => s.trim()).filter(Boolean);
    const q = [...sentences].reverse().find((s) => /[？?]$/.test(s));
    if (q) asked.push(q.slice(0, 120));
  }
  return asked.slice(-10);
};

export interface ResumedTextLesson {
  msgs: { role: 'student' | 'tutor'; text: string }[];
  chatState: ChatConvState;
}

/**
 * 保存済み発話（ai_session_utterances）からテキスト会話を復元する。
 * - studentTurns = 学習者発話数（サーバー側のターン導出と同じ基準）
 * - closingAnnounced/done は最大ターンからの位置で再判定（8ターン保証を維持）
 */
export const buildResumeFromUtterances = (
  // speaker はDB由来の生文字列を受ける（student/tutor 以外はここで除外する）
  utts: { speaker: string; transcript: string }[],
  maxTurns = TEXT_MAX_TURNS_DEFAULT,
): ResumedTextLesson => {
  const msgs = utts
    .filter((u) => (u.speaker === 'student' || u.speaker === 'tutor') && u.transcript.trim().length > 0)
    .map((u) => ({ role: u.speaker as 'student' | 'tutor', text: u.transcript }));
  const studentTurns = msgs.filter((m) => m.role === 'student').length;
  const asked = deriveAskedQuestions(msgs.filter((m) => m.role === 'tutor').map((m) => m.text));
  return {
    msgs,
    chatState: {
      studentTurns,
      maxTurns,
      asked,
      closingAnnounced: studentTurns >= maxTurns - 1,
      done: studentTurns >= maxTurns,
    },
  };
};
