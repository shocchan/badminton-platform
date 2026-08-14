# p4-ops-release:OPS-2 (P1)

## Evidence
AiCourseAdminPage.tsx は旧12週コース指標のみ（currentWeek「Week N」:125行、COURSE_MISSIONS:127行、learnerStats/calculateSpeakingGrowth）。'診断'・adventureV2・questLog への参照ゼロ（grep確認）。CourseLearnerList.tsx はAI会話セッション数とコストのみで、バトル・読解だけの日は「今月未利用」（53行）。一方 PILOT_OPERATIONS.md §7（146-154行）は admin で「診断が完了しているか」「冒険を1回でも完了しているか」を、週次運用（290-295行）は「adminで3名の学習日数を見る」を指示しており実行不能。AdminLearnerRow は Learner を extends し settings を保持（courseAdminApi.ts:7,21）、readAdvProfile(settings) が advProfile.ts:113 に存在するためフロントのみで修正可能。

## FixSpec
対象: /Users/shocchan/badminton-aicourse/src/components/ai-course/CourseLearnerList.tsx のみ（一覧カードに1行足せば§7の3項目と週次の学習日数がすべて見える。詳細画面の改修は過剰なのでしない）。

【編集1】import に追加（6行目の import type の下）:
import { readAdvProfile } from '../../lib/aiLesson/course/adventure/advProfile';

【編集2】コンポーネント冒頭（`const monthlyCapOf = ...` の下）にヘルパー追加:
const dayKey = (d: Date) => d.toLocaleDateString('sv-SE');

【編集3】カード内の最終行、旧:
            <p className="text-[10px] text-gray-400 mt-1">
              {u.lastDate ? `最終 ${u.lastDate.slice(5)}` : '今月未利用'}
            </p>
の直後に追加:
            {(() => {
              // V2の初日チェック・週次確認用（PILOT_OPERATIONS §7・週次運用）。
              // ①診断の完了 ②冒険完了回数 ③直近7日の学習日数＋最終学習日。settingsから読むだけ（追加取得なし）
              const v2 = readAdvProfile(l.settings);
              if (!v2 || !v2.enabled) return null;
              const doneCount = v2.questLog.filter((q) => q.totalSteps > 0 && q.completedSteps >= q.totalSteps).length;
              const last = v2.questLog.length > 0 ? v2.questLog[v2.questLog.length - 1].dateKey : null;
              const weekAgo = dayKey(new Date(Date.now() - 6 * 86400000));
              const days7 = new Set(v2.questLog.filter((q) => q.dateKey >= weekAgo).map((q) => q.dateKey)).size;
              return (
                <p className="text-[10px] text-blue-700 mt-1">
                  V2: 診断{v2.diagnosis ? '済' : '未'} ／ 冒険完了{doneCount}回 ／ 直近7日 {days7}日
                  {last ? ` ／ 最終 ${last.slice(5)}` : ''}
                </p>
              );
            })()}
（管理画面はしょっちゃん専用のため日本語ハードコードで可。同ファイルの「今月未利用」等と同じ扱い）
