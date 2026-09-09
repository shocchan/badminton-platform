// のこりの会話回数（2026-09-09 C-3）。
//
// 無料でも無制限にはしない。ただし**押してから断られる**のがいちばん悪いので、
// 押す前に「あと何回できるか」を出す。数え方はサーバー（ai_start_session）と同じ。
//
// 枠を使い切っても学習は終わらない。冒険・バトル・復習・模試は原価ゼロで、
// この枠の外にある——そのことをここで必ず言う（行き止まりに見せない）。
import { MessageCircle } from 'lucide-react';
import type { ConversationBudget } from '../../lib/aiLesson/course/conversationBudget';

export const ConversationBudgetChip = ({ lang, budget }: {
  lang: 'ja' | 'zh';
  budget: ConversationBudget | null;
}) => {
  // 枠が無い人（手動発行の従来生徒）には何も出さない。無いものを0と見せない
  if (!budget || !budget.hasBudget) return null;

  const zh = lang === 'zh';
  const left = budget.voiceRemainingTotal;
  const today = budget.voiceRemainingToday;
  const exhausted = left <= 0;
  const todayDone = !exhausted && today <= 0;

  return (
    <div className={`mb-3 rounded-2xl border px-3 py-2.5 ${
      exhausted ? 'border-gray-200 bg-gray-50' : 'border-blue-200 bg-blue-50/60'}`}>
      <p className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-900">
        <MessageCircle className="h-4 w-4 text-blue-600" aria-hidden />
        {exhausted
          ? (zh ? 'AI会话的次数用完了' : 'AI会話の回数を使い切りました')
          : todayDone
            ? (zh ? `今天的AI会话已经做完了（还剩${left}次）` : `今日のAI会話は終わりました（のこり${left}回）`)
            : (zh ? `AI会话 还可以做${left}次（今天${today}次）` : `AI会話はあと${left}回（今日は${today}回）`)}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
        {exhausted || todayDone
          ? (zh
            ? '冒险、词汇战斗、阅读、听力和复习不算在这个次数里，今天也可以继续学习。'
            : '冒険・語彙バトル・読解・聴解・復習はこの回数に入りません。今日もこのまま学習を続けられます。')
          : (zh
            ? `每天最多${budget.voicePerDay}次。文字会话今天还可以做${budget.textRemainingToday}次。`
            : `1日に使えるのは${budget.voicePerDay}回までです。テキスト会話は今日あと${budget.textRemainingToday}回できます。`)}
      </p>
    </div>
  );
};

export default ConversationBudgetChip;
