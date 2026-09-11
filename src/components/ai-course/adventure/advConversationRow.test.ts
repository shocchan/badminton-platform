// AI会話の残り回数の見せ方（2026-09-11 CEO要望）。
// ホーム上部の帯は「使ってもいない人に使い切りましたと出る」ので廃止し、
// 「ほかの学習」のAI会話の行だけで残り回数と鍵を見せ、0回なら回数券の案内へ直行する。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const SHELL = readFileSync(new URL('./AdvShell.tsx', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../../pages/ai-lesson/AiCoursePage.tsx', import.meta.url), 'utf8');

describe('ホーム上部の帯', () => {
  it('「AI会話の回数を使い切りました」の帯は無い', () => {
    expect(existsSync(new URL('../ConversationBudgetChip.tsx', import.meta.url))).toBe(false);
    expect(PAGE).not.toMatch(/ConversationBudgetChip|budgetChip/);
    expect(SHELL).not.toMatch(/AI会話の回数を使い切りました/);
  });
});

describe('「ほかの学習」のAI会話の行', () => {
  const row = SHELL.slice(SHELL.indexOf("label={tx(lang, 'AI会話（ベータ）'"), SHELL.indexOf("label={tx(lang, 'AI会話（ベータ）'") + 1400);
  it('残りがあれば「あとN回」、0回なら鍵と「回数券で続ける」を出す', () => {
    expect(row).toMatch(/あと\$\{props\.conversationRemainingWeek\}回/);
    expect(row).toMatch(/🔒[^<]*回数券で続ける/);
    expect(row).toMatch(/data-testid="conversation-locked"/);
  });
  it('0回のときは場面選択を飛ばして回数券の案内（会話の入口）へ行く', () => {
    expect(row).toMatch(/if \(props\.conversationRemainingWeek === 0\) \{ props\.onStartConversation\(\); return; \}/);
  });
  it('残りが分からないとき（null）は何も出さない', () => {
    expect(row).toMatch(/props\.conversationRemainingWeek == null \? undefined/);
  });
});
