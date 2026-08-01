# 【N2／N3 ADAPTIVE ADVENTURE PILOT FINAL】

作成: 2026-08-01 ／ branch `feature/ai-course-adventure-v2-completion`

| 項目 | 判定 |
|---|---|
| N2 Target Route | **COMPLETE** |
| N3 Target Route | **COMPLETE** |
| Conversation Route | **COMPLETE** |
| Hybrid Route | **COMPLETE** |
| Today Adventure | **COMPLETE** |
| Vocabulary | **COMPLETE** |
| Grammar | **COMPLETE** |
| Reading | **COMPLETE** |
| Listening | **COMPLETE** |
| Time Management | **COMPLETE** |
| Problem Battle | **COMPLETE** |
| Midboss | **COMPLETE**（ロジック＋開放条件。専用UIは既存BattleRunnerを流用） |
| Mini Mock | **INCOMPLETE**（仕様・条件判定はCOMPLETE。**section遷移UIが未実装**） |
| Readiness by Skill | **COMPLETE** |
| AI Conversation E2E | **INCOMPLETE**（導線は接続済み・実会話1周の実走は未実施） |
| Retry | **COMPLETE** |
| Review | **COMPLETE** |
| Human Lesson Bridge | **COMPLETE** |
| Language Integrity | **PASS** |
| Unauthorized Scripts | **0件** |
| Chinese Explanation Active Issues | **0件**（learner-visibleなB類4件は修正済み。C類97件はhumanReviewCandidate） |
| HOLD Leakage | **0件** |
| N2 Active Questions | **554**（rec 150／cloze 199／meaning 172／form 33） |
| N3 Active Questions | **248**（rec 59／cloze 84／meaning 72／form 33）＋単元問題608 |
| N2 Reading Sets | **30** |
| N3 Reading Sets | **30** |
| N2 Listening Sets | **25**（音声25件） |
| N3 Listening Sets | **25**（音声25件） |
| Correct Position Distribution | **24.99% / 25.02% / 24.97% / 25.01%**（χ²=0.02・10,000 battle） |
| P0 | **0** |
| P1 | **0** |
| P2 | **4** |
| P3 | **2** |
| **N2／N3 Adaptive Adventure Pilot Complete** | **NO** |
| **Staging Ready** | **YES** |
| **Production Deploy** | **NOT_EXECUTED** |

## Pilot Complete が NO の理由

§26の完了条件のうち **2件が未達**です。設計書だけ・runtime未接続を COMPLETE と呼ばない方針に従い、正直に NO とします。

| 未完task | 内容 | remaining | blocked reason |
|---|---|---|---|
| **E-3** | ミニ模試の section遷移UI（残り時間・未回答警告・終了確認・section別結果画面） | 1 | 無し（AI実装可能・時間切れ） |
| **G-3** | AI会話E2E 1周（Today Adventure → 会話 → レポート → 言い直し → 復習登録 → 完了） | 1 | 実API課金＋実learnerセッションが必要。導線・データ受け渡しは実装済み |

現在 `advMock.ts` は模試の**仕様・出題条件・技能判定**を持ち、テストで固定していますが、
**画面（section遷移）が無いため learner は模試を実行できません**。
そのため準備度の総合判定も timed evidence を得られず、実運用では常に「未判定」のままになります。

## 詳細

1. **branch**: `feature/ai-course-adventure-v2-completion`（base `b346edf`）
2. **HEAD**: `f89557f`（+ 本報告のcommit）
3. **commits**: 3（Phase A-C ／ Phase D ／ Phase E-H）
4. **working tree**: clean
5. **origin**: 未push（本報告commit後にpush）
6. **staging URL**: https://staging.badminton-platform.pages.dev （deploy `91c609ec`）
7. **work queue**: `completion-work-queue.json`（A-1〜J-2）
8. **content inventory**: N2 canonical 178＋alias 2／N3文法 76／N3単元 12／単元問題 608／語彙 140
9. **Chinese explanation audit**: `zh-explanation-audit.json` — 1560件を A正当1346／B不要19／C要判断195 へ分類。
   learner-visible: A 917／**B 4（修正済み）**／C 97（humanReviewCandidate）
10. **HOLD handling**: `hold-audit.json` — N2 28／N3 17。
    REPLACE_WITH_SAFE_VARIANT 33・REPAIR_AND_RELEASE 12・**0問項目 0**。
    HOLD問題は `buildVariantPool` が emit しないため battle selector に到達しない（テストで固定）
11. **reading bank**: N2 30・N3 30。全件で「根拠が本文に実在」を機械検査。複数正解0・漏洩0・長さ比≤3.2
12. **listening bank**: N2 25・N3 25。全件が再生可能（manifest必須）。transcriptは解答後のみ
13. **audio pipeline**: `generate-listening-audio.mjs`（macOS `say -v Kyoko -r 175` → `afconvert` → m4a/AAC 64kbps）。
    50件・計975秒・平均19.5秒・失敗0。秒/文字比 0.06〜0.5 で読み上げ失敗を検出。
    音声が無いsetは `playableSets()` から除外されて出題されない
14. **time management**: N2 105+50分／N3 30+70+40分。**速いだけでは高評価にしない**
    （時間内完走50%＋時間内正答率40%＋未回答の少なさ10%）
15. **midboss**: 単元定着≥50%・未出正答率≥60%・問題数≥15 が揃うまで開かない。15〜20問・制限時間つき
16. **mini mock**: 4技能（語彙5・文法5・読解4・聴解4）が揃うまで「総合」と名乗らない。
    未達時は「準備中」「文法・語彙ミニ模試」「一部科目」へ落ちる。「本番同等」と表示しない
17. **readiness**: 5技能×evidence 6指標。**timed evidenceが無ければ総合を出さない**。AI会話は別軸
18. **Today Adventure**: 試験技能を「未着手 > 最弱 > 試験日60日前」で配分。
    出題対象が空ならstepを作らない。会話目的では試験技能を積まない
19. **AI conversation E2E**: 未実施（上記G-3）
20. **report / 21. retry / 22. review**: 既存runtimeへ接続済み。言い直しは素材0件でも必ず進める
23. **teacher summary**: 試験科目別evidence（出題・未出・7日後・時間つき・直近正答率）＋本人の相談を最優先・最大3件
24. **ja** / 25. **zh**: staging実測。準備度・言い直し・聴解・読解すべて中国語化。
    中国語画面の日本語対象は `JaTermText` で視覚分離
26. **mobile**: 375px で overflow 0・42px未満ボタン 0
27. **accessibility**: aria-label／aria-live／aria-pressed／aria-expanded・44px標的
28. **tests**: **1437 PASS**（新規: 読解13・聴解14・試験18 ほか）
29. **TypeScript**: 0 errors
30. **lint**: AIコース側 0
31. **build**: PASS（言語整合性validatorがbuild前に自動実行）
32. **persona A**（N2目標・現在地N3未満）: staging実走。目的地N2維持・N3経由地・文法→聴解→会話の流れを確認
33. **persona B**（N3目標）: seed scriptでN3ルート生成をテスト。UI実走は未実施
34. **persona C**（会話目標）: ユニットテストで固定（試験技能stepを積まない）
35. **persona D**（hybrid）: ユニットテストで固定
36. **persona E**（1日5分）: ユニットテストで固定（≤8分・1〜3step）
37. **P0**: 0
38. **P1**: 0
39. **P2／P3**:
    - P2-1 ミニ模試のsection遷移UI未実装（→ E-3）
    - P2-2 AI会話E2E未実走（→ G-3）
    - P2-3 中国語解説のC類97件がhumanReviewCandidateのまま
    - P2-4 Mapの「内容を見る」が `window.alert` 実装
    - P3-1 `ending_category_giveaway` 警告5件が人間レビュー待ち
    - P3-2 Persona B/D/Eのstaging実走が未実施（ユニットテストのみ）
40. **RC tag**: 未付与（Pilot Complete=NO のため。完了時の候補は `ai-course-adventure-v2-rc2`）
41. **CEO staging確認URL**:
    - ja: `https://staging.badminton-platform.pages.dev/ja/ai-course?v2=1`
    - zh: `https://staging.badminton-platform.pages.dev/zh/ai-course?v2=1`
    - ⚠️ 旧画面が出たら末尾に `&cb=1`（Cloudflare edgeキャッシュ）
42. **remaining work**: E-3（模試UI）→ G-3（会話E2E）→ RC freeze
43. **exact resumeFrom**: `completion-work-queue.json` の **E-3**。
    次セッションprompt: `docs/ai-course/adventure-v2/completion-next-session-prompt.md`
