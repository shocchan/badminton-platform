# AIコース モバイルナビゲーション（案A・Phase 2E-1.5 §16）

対象: labPreview（しょっちゃん）のモバイル表示のみ。一般受講生（Andyさん等）は従来の5項目のまま変更なし。

## 構成

- モバイル（lg未満）: **ホーム / AI会話 / ことば / 基礎（しくみ短縮） ＋ その他**
- 「その他」シート: 成長・設定（`role="menu"`・`aria-expanded`・Escape/外側クリックで閉じる）
- デスクトップ（lg以上）: 6項目のまま（ホーム/AI会話/ことば/しくみ/成長/設定）

## 実装

- `src/components/ai-course/CourseHeader.tsx` の `MobileLabNav`
- analytics: `open_ai_course_mobile_more`（開いた回数のみ・PIIなし）
- テスト: `src/components/ai-course/courseHeader.test.tsx`
  （その他シートの開閉・Escape・一般受講生に「その他」が無いこと）

## 案Aを選んだ理由

6項目をモバイル幅に押し込むとタップ領域が44px未満になり、ラベルが省略される。
利用頻度の低い成長・設定をシートへ逃がし、主要4項目のタップ領域を確保した。
