# p2-n2-kika:F3 (P1)

## Evidence
実在を確認。AdvShell.tsx:979でmockPending、984でsheetResumableを算出するが、1183-1188の今日の冒険CTAの降格条件はmockPendingのみ。1098-1111の答案再開バナーはaction-primary-blueのbg-blue-600（primary同格）で、答案進行中はHomeに青primaryが2つ並ぶ。答案の残り時間は壁時計基準で進行（advAnswerSheet.ts:154-167）。canon原則3「Homeの主要CTAは常に一つ」に違反。secondaryBtnはAdvShell.tsx:38でimport済み。

## FixSpec
対象: src/components/ai-course/adventure/AdvShell.tsx

【Edit 1】CTA降格（1183-1189行）。旧:
```
          {!allDone && nextStepIdx >= 0 && (
            <button type="button"
              className={mockPending ? `${secondaryBtn} mt-4` : `${primaryBtn} mt-4`}
              onClick={() => runStep(nextStepIdx)}>
              {mockPending ? tx(lang, '模試のあとで今日の冒険をする', '模拟考之后再做今天的冒险') : ctaLabel()}
            </button>
          )}
```
新:
```
          {!allDone && nextStepIdx >= 0 && (
            <button type="button"
              className={mockPending || sheetResumable ? `${secondaryBtn} mt-4` : `${primaryBtn} mt-4`}
              onClick={() => runStep(nextStepIdx)}>
              {mockPending ? tx(lang, '模試のあとで今日の冒険をする', '模拟考之后再做今天的冒险')
                : sheetResumable ? tx(lang, '答案のあとで今日の冒険をする', '交完答案再做今天的冒险')
                : ctaLabel()}
            </button>
          )}
```

【Edit 2】根拠コメント更新（977-978行）。旧:
```
  // 中断した模試は残り時間が動いているので、そのときだけ「今日の一手」を模試の再開にする。
  // 主要CTAを2つ並べない（canon 原則3）ため、今日の冒険側は副次スタイルへ落とす。
```
新:
```
  // 中断した模試・進行中の答案用紙は残り時間が壁時計で動いているので、その間は「今日の一手」を再開側にする。
  // 主要CTAを2つ並べない（canon 原則3）ため、今日の冒険側は副次スタイルへ落とす。
```

注: 紙が取り下げられた場合（sheetSessionありでsheetResumable=false、1113-1127行）はバナーのボタンがamber系のみでprimary衝突が無いため、降格条件はsheetResumableで正しい。mockPendingとsheetResumable同時成立時は模試文言が優先（既存orderのまま）。
