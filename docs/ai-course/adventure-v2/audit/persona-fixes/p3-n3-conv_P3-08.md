# p3-n3-conv:P3-08 (P2)

## Evidence
確認済み。①emphasis の消費者ゼロ: advCompanion.ts:11/19/27 で定義、advTypes.ts:173 で「クエスト構成のわずかな重み」と宣言するが、advQuest.ts に companion/emphasis の参照は0件（grep実測）。参照は定義元と advLanguageCollect.ts（文言収集ユーティリティ）のみ。②相棒はオンボーディング後どこにも出ない: COMPANIONS/companionSvg の UI 使用は AdvOnboarding.tsx のみ、companionById は定義ファイル内でしか使われず、AdvShell.tsx:1070 の Home 声掛けは teacher.greetJa（先生）で companion の greet は未使用。③さらにオンボーディング文言（AdvOnboarding.tsx:235）『学習内容は変わりません。応援のしかたが少し変わります。』の後半が現状では虚偽（応援も何も変わらない）＝監査の「虚偽表示ではない」との評価より実態は悪い。advCompanion.ts:2 の設計コメント「推奨比率とHomeの声掛けだけを変える」のうちHomeの声掛けも未実装。hybrid の会話比率は advQuest.ts:158-165 で会話1step固定・変更手段なし、も確認。

## FixSpec
最小修正 = 「応援のしかたが少し変わります」を真にする（相棒の声掛けをHomeに出す）＋ emphasis 未配線は運用手順書に既知の制限として明記。emphasis のquest反映は新機能追加なので今回はやらない（過剰な作り込み回避）。

■修正1: src/components/ai-course/adventure/AdvShell.tsx — import 追加。
アンカー（現コード、30行目）:
import { AdvOnboarding, type OnboardingOutcome } from './AdvOnboarding';
新コード:
import { AdvOnboarding, type OnboardingOutcome } from './AdvOnboarding';
import { companionById, companionSvg } from '../../../lib/aiLesson/course/adventure/advCompanion';

■修正2: AdvShell.tsx Home — 先生ブロックの直後に相棒の声掛けを追加。
アンカー（現コード、1059-1073行目の先生ブロック全体）:
      {/* 案内の先生の一文（次の行動を言う）。7画面すべてで同じ先生に揃える */}
      <div className="mt-2 mb-4 flex items-center gap-3">
        <TeacherAvatar size={48} expression="smile" lang={lang}
          className={`shrink-0 ring-2 ${teacher.ringClass}`} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-500">{teacherLabel}</p>
          <p className="text-sm leading-snug text-gray-700">
            {quest
              ? tx(lang,
                `今日は${quest.estimatedMinutes}分。${nextStep ? `まず「${nextStep.titleJa}」から始めましょう。` : '今日のぶんは終わりました！'}`,
                `今天${quest.estimatedMinutes}分钟。${nextStep ? `先从「${nextStep.titleZh}」开始吧。` : '今天的份量已经完成了！'}`)
              : tx(lang, teacher.greetJa, teacher.greetZh)}
          </p>
        </div>
      </div>
このブロックの直後に追加:
      {/* 旅の相棒の声掛け（§8・D-010）。オンボーディングの「応援のしかたが少し変わります」をここで果たす */}
      {prof.companionId && (
        <div className="-mt-2 mb-4 flex items-center gap-2">
          <span className="h-8 w-8 shrink-0" aria-hidden
            dangerouslySetInnerHTML={{ __html: companionSvg(prof.companionId) }} />
          <p className="text-xs text-gray-600">
            <span className="font-semibold">{tx(lang, companionById(prof.companionId).nameJa, companionById(prof.companionId).nameZh)}</span>
            ：{tx(lang, companionById(prof.companionId).greetJa, companionById(prof.companionId).greetZh)}
          </p>
        </div>
      )}
（prof.companionId は advTypes.ts:233 に実在・advProfile.ts:131 で検証済みの値。greet 文言は advCompanion.ts の既存 ja/zh をそのまま使うので新規文言不要）

■修正3: docs/ai-course/PILOT_OPERATIONS.md — §10「トラブル時の対応」の表の直後に追記（全文）:

**既知の制限（設計判断・2026-08）**

- 相棒（ナミ／フク老師／カジ）の emphasis 重みはクエスト構成に未反映（型定義上の宣言のみ）。hybrid（総合）の1日クエストの会話比率は固定（会話step1つ）。「もっと会話を増やしたい」という学習者には、目的を「会話」へ変更する（オンボーディングをやり直す）案内をする。

■修正4（任意・1行）: src/lib/aiLesson/course/adventure/advTypes.ts:172 のコメントを実態に合わせる。
現コード:
  /** クエスト構成のわずかな重み（合計1.0） */
新コード:
  /** クエスト構成用に予約（現在は未使用・Homeの声掛けのみ相棒で変わる） */
