# p4-ops-release:OPS-4 (P1)

## Evidence
PILOT_OPERATIONS.md 105-109行の「コース別の一言」は N2+帰化面接／N3 の2つのみ。§1（28行）は目標に「JLPT＋会話」を含む4択を控えると定め、オンボーディングの目的は3択（advTypes.ts:290-294 GOAL_LABELS: jlpt/conversation/hybrid）。hybrid のみ advQuest.ts で targetSkills が ['grammar','conversation'] 配分になり、conversation は試験step除外（goalType === 'conversation' で examCandidates が空）＝選び間違いで毎日の構成が変わる。目的・レベル変更UIは task #31 で実装中（未完）。§6b（124-144行）は N2+面接／N3 のみで hybrid への言及ゼロ。文言（運用手順書）追記のみで解決可能。

## FixSpec
対象: /Users/shocchan/badminton-aicourse/docs/ai-course/PILOT_OPERATIONS.md のみ（コード変更なし）。

【編集1】§5 の 109行目「- N3コースの人 →「目標は **N3** を選んでください」」の直後に1行追加:
- JLPT＋会話コースの人 →「目的は **『JLPTも会話も伸ばしたい』**、目標は申込時に控えたレベル（**N2** または **N3**）を選んでください」

【編集2】§6b の末尾、「**N3コースの人**には発行するものはない（文法・語彙・読解・聴解はV2に内蔵）。」の直後に1行追加:
**JLPT＋会話コースの人**にも発行するものはない（会話ミッション・言い直し練習はV2に内蔵。目的で『JLPTも会話も伸ばしたい』を選んでいれば毎日の冒険に自動で入る）。
