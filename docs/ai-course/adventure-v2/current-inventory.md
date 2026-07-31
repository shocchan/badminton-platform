# Adventure V2 — 現状監査（Phase 1・2026-07-31）

機械集計: `generated/inventory.json`（`vite-node scripts/ai-course/adventure-v2-inventory.ts` で再生成）。
期待値との照合は下表のとおり。**手計算・記憶からの転記は禁止**（実データ再集計のみ）。

## 1. Git / デプロイ実状態

| 項目 | 値 |
|---|---|
| 監査時branch | `hotfix/ai-course-preinvite-ux`（2795685・origin push済・staging実測済） |
| origin/main | `0e08833`（August Pilot本番リリース済 d406a82 + UX監査docs） |
| **production** | kawabado.com = deploy `f7b401b6`（RC tag `ai-course-content-rc3`・code `6bb024d`・main merge `026e226`） |
| production rollback先 | deploy `c27eba9b`（main `9f8838a`） |
| staging | hotfix 0e59276版（LPログイン導線・イラスト6枚・レポートzh補助 等） |
| **V2 branch** | `feature/ai-course-adaptive-adventure-v2`（base=hotfix tip 2795685） |
| DB | 本番migration差分0でPilotリリース（AIコース進捗はlocalStorage。server syncはprobe-gated実装済み・**remote未適用**=H2人間ゲート待ち） |
| テスト | 1078（session-12時点。V2開始時に再実行して確定する） |

**V2 branchのbase判断**: 仕様は「最新origin/main」だが、hotfix 2commitsはstaging検証済みの
AIコースUX修正（UX-001 P1のLPログイン導線を含む）であり、origin/mainベースだとV2がこの修正を
失って将来衝突する。→ **hotfix tipをbaseに採用**（= origin/main + AIコースUX修正のみ。decision log D-001）。

## 2. 教材・コンテンツ実数（期待値照合）

| 対象 | 期待値 | **実測** | 判定 |
|---|---|---|---|
| N2 canonical grammar | 178 | **178** | ✅ 一致（index 180 − alias 2） |
| N2 aliases | 2 | **2**（n2g-024→023, n2g-104→102・CEO裁定7/30） | ✅ 一致 |
| Vocabulary | 140 | **140**（foundation 78 + N3prep 62） | ✅ 一致 |
| Chapters | 10 | **10**（各5 quests = 50） | ✅ 一致 |
| Areas | 10 | **10**（ミナモ列島） | ✅ 一致 |
| N3 grammar drafts | 推測禁止 | **76**（N3_GRAMMAR_DRAFTS実数） | 実測確定 |
| N3 units | — | **12**（N3_UNIT_SPECS） | 実測確定 |
| N3 生成問題 | — | **608**（12単元・diagnostic/understand/distinguish/apply） | 実測確定 |
| N2 バトル問題 | — | **178**（= 1項目1問のrecognitionのみ） | ⚠️ 最大ギャップ |
| AI会話context | — | 140（release-inventory.json: contextData 140・dead 0） | ✅ |
| 60ミッション | — | courseData.ts 12週×5（従来コース・温存） | ✅ |

### ⚠️ V2にとっての最重要ギャップ

1. **N2問題プール = 1項目1問**。§18「複数variant・80%攻略が問題ID暗記で達成できない」を
   満たすには variant生成architecture が必須（§15の未出問題条件も現状は不成立）。
2. **N3文法76項目には出題データが未接続**（608問は語彙ベースの単元問題。文法ドラフト76件の
   問題は recognition 相当も無い）→ N3文法バトルはvariant生成で新設する。
3. 読解・聴解・並べ替え・誤文訂正など§14の問題タイプは**現状ほぼ無い**（N3にorder型あり）。

## 3. Runtime機能の現況（V2が再利用する土台）

| 機能 | 状態 | V2での扱い |
|---|---|---|
| text/voice会話runtime | 完成（8ターン・closingPhase・zh訳・ふりがな） | **そのまま再利用**（§19禁止事項） |
| report / retry / review | 完成（day1→3→7→30・extra） | 再利用。V2クエストから接続 |
| XP | xp.ts 完成 | 再利用（表示順は§22で能力変化の後へ） |
| spaced repetition | courseEngine（昇格のみ・降格なし） | 再利用 |
| onboarding | ヒアリング→プラン（従来型） | **V2で全面再設計**（goal選択から） |
| World Map / Home | FOREST FIRST版（10エリア・施設カード6） | **V2で再設計**（第一CTA一本化） |
| N3単元runtime | unitRuntime（phase制・診断→stage1-3） | 問題エンジンの土台として再利用 |
| N2 quest | n2quest（recognition 1問） | バトルエンジンへ拡張 |
| learner profile | ai_learners.settings jsonb（LearnerSettings） | **V2 profileはここに追加**（migration不要） |
| progress | localStorage（server syncはprobe-gated・remote未適用） | V2進捗も同型。reload/sync検証必須 |
| RLS | 全表RLS＋GRANT検証済み（H1 local matrix 20/20） | 非接触（remote migration禁止） |
| analytics | courseAnalytics（イベント名+匿名パラメータ） | §24の新イベントを同型で追加 |
| 人間レッスンdata | **未実装**（カレンダー連携なし） | §20どおりnextHumanLessonAt等をprofileに新設 |
| feature flag | 既存の仕組みなし（variant routeのみ） | learner単位flag（settings.adventureV2.enabled）新設 |

## 4. UX監査（2026-07-31実施済み分の引き継ぎ）

- UX-001 [P1] LPログイン導線なし → **hotfixで解消済み**（V2 baseに含む）
- UX-002/003/004/011/012/013 [P2]: zh施設名が日本語のまま・Home CTA過多・レポートzh補助・
  図鑑イラスト品質3件 → **V2のHome再設計（§12第一CTA一本化）と§25原則で吸収する**
- route journey map: dead end 0・復習入口3重複・「ミナモ列島をめぐる」重複入口
  → V2 Mapで整理
- analytics: ★追加5イベント案あり → §24のV2イベント設計に統合

## 5. 制約（このsprintで不変）

- 本番: main merge / production deploy / learner invite / Stripe / remote migration **禁止**
- 既存learner（Pilot 3名・Andyさん）: データ変更禁止・自動V2移行禁止・従来Homeをfallback維持
- 教材: canonical再利用が原則。human_reviewed/approved一括昇格禁止。N2 178の大量書き換え禁止
- 権利: 原本Excel例文はruntime使用禁止（sourceExample退避方針を維持）
- XHS関連は本sprintに存在しない（全社ルール0は非該当）
