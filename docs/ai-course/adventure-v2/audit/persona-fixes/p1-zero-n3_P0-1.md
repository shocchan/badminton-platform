# p1-zero-n3:P0-1 (P0)

## Evidence
全て実コードで確認。(1) /Users/shocchan/badminton-aicourse/src/lib/aiLesson/course/adventure/advQuest.ts L158-163: 15分ブランチは examSkillStep()&&shouldPrioritizeExamSkill() でバトルを差し替え。L144-148: readingEvidence===0||listeningEvidence===0 で常にtrue、両方測定後も weakestSkill が reading/listening ならtrue。(2) AdvShell.tsx L215-220: weakestSkill は evidenceCount>0 の技能のみから選ぶため、語彙・文法が未測定なら読解/聴解が常に最弱。語彙・文法の bySkill evidence はバトル(gradeEncounter)・模試(toMockAttempt)からしか台帳に入らないことを advReadiness.ts collectSkillEvidence(L86-138)と全recordAttempt呼び出し(AdvShell L179/359/361/543)で確認 → 循環成立。(3) L153-157: 5分ブランチにバトル無し(weak_reinforceはweakGrammarIds必要だが、それもバトル実績が無いと空のまま)。(4) AdvOnboarding.tsx L64: デフォルト15分。(5) AdvShell L233-234はstage無視で readingTargetIds(lvl)/listeningTargetIds(lvl) を渡し、readingSetsFor('N3')の先頭3セットは n3r-short-01〜03（実N3短文、vite-node実測で確認）。pre_n5診断でも route の stage は foundation_camp から始まる(advRoute.ts L69-73)のに読解・聴解はN3固定。反証を試みたが、ミニ模試（第二階層・任意）を自発的に受けない限り循環は破れない。指摘は正確。

## FixSpec
対象: /Users/shocchan/badminton-aicourse/src/lib/aiLesson/course/adventure/advQuest.ts のみ（AdvShell側は変更不要。advQuest側で出題自体を止めるため）。

【変更1】examCandidates 冒頭に stage ゲートを追加（stageはL106で定義済み・クロージャ参照可）。
現コード(L124):
    if (!ex || goalType === 'conversation') return [];
新コード:
    if (!ex || goalType === 'conversation') return [];
    // 基礎固め中（基礎キャンプ・N3橋）はN3読解・聴解を出さない。
    // 診断で基礎不足と測った直後にN3長文を毎日出すのは「現在地はAIが測る」（canon§1）への裏切りになる
    if (stage.kind === 'foundation_camp' || stage.kind === 'n3_bridge') return [];

【変更2】15分ブランチ: 試験技能を奇数日に限定しバトルを必ず回す。
現コード(L158-163):
  } else if (minutes === 15) {
    if (weakGrammarIds.length > 0) push(step('weak_reinforce', weakGrammarIds.slice(0, 2), '弱点補強', '弱点补强'));
    push(parts.learn);
    // 15分では文法と試験技能のどちらかを入れる（両方入れると時間超過する）
    if (examSkillStep() && shouldPrioritizeExamSkill()) push(examSkillStep());
    else push(parts.battle);
新コード:
  } else if (minutes === 15) {
    if (weakGrammarIds.length > 0) push(step('weak_reinforce', weakGrammarIds.slice(0, 2), '弱点補強', '弱点补强'));
    push(parts.learn);
    // 15分では文法と試験技能のどちらかを入れる（両方入れると時間超過する）。
    // ただし語彙・文法のevidenceはバトルからしか入らないため、試験技能を常に優先すると
    // 「バトルが出ない→語彙/文法が未測定→読解/聴解が常に最弱→バトル永久排除」の循環が確定する。
    // 試験技能は奇数日に限定し、バトルを少なくとも隔日で必ず回す。
    const examDay = Number(dateKey.slice(-2)) % 2 === 1;
    if (examDay && examSkillStep() && shouldPrioritizeExamSkill()) push(examSkillStep());
    else push(parts.battle);

【変更3】5分ブランチ: 隔日でバトルを入れる（parts.battleは会話stageではnullなので追加ガード不要）。
現コード(L153-157):
  if (minutes === 5) {
    // 5分: 復習＋弱点1つ or 新規のどちらか＋ミニ会話（会話goalのみ）
    if (weakGrammarIds.length > 0) push(step('weak_reinforce', weakGrammarIds.slice(0, 1), '弱点を1つつぶす', '攻克1个弱点'));
    else push(parts.learn);
    if (goalType !== 'jlpt') push(parts.conv);
新コード:
  if (minutes === 5) {
    // 5分: 復習＋弱点1つ or 新規のどちらか＋ミニ会話（会話goalのみ）。
    // バトルが一度も出ないと攻略（mastery）が永久に進まないため、奇数日はバトルを入れる
    const battleDay = Number(dateKey.slice(-2)) % 2 === 1;
    if (battleDay && parts.battle) push(parts.battle);
    else if (weakGrammarIds.length > 0) push(step('weak_reinforce', weakGrammarIds.slice(0, 1), '弱点を1つつぶす', '攻克1个弱点'));
    else push(parts.learn);
    if (goalType !== 'jlpt') push(parts.conv);

新規UI文言なし（既存step文言「問題バトル/问题战斗」を再利用）。注意: 5分枠にest6分のバトルが入る日は estimatedMinutes 表示が最大9分になるが許容（既存の15分枠も同様の近似）。検証: advCore.test.ts / advWeekly.test.ts が15分構成を固定している可能性があるため npx vitest run で更新。手動確認は「pre_n5診断・15分・JLPT目標でDay1〜4を進め、バトルが出ること／基礎stage中に短文読解が出ないこと」。
