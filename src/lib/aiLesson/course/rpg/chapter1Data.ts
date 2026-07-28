// RPG Chapter 1「はじまりの町」data contract（Vertical Slice・labPreview限定）。
// 完全オリジナルの世界・人物・Story。既存IP（キャラ・地名・設定）は一切参照しない。
// learningItemIds は実在の教材ID（foundationVocabBank）のみ。存在しないIDの創作は禁止
// （chapter1Data.test.ts が全IDの実在を機械検証する）。
// 名称はすべて仮称。正式名称は人間承認後に変更可能（IDは安定させる）。

export interface Chapter1Location {
  locationId: string;
  nameJa: string;
  nameZh: string;
  /** マップ上の相対座標（0..100・見下ろしマップ用） */
  x: number;
  y: number;
}

export interface Chapter1Npc {
  npcId: string;
  nameJa: string;
  nameZh: string;
  roleJa: string;
  locationId: string;
  /** 出会い前に掛かっている霧の中の一言（聞き取れない表現） */
  foggyLineJa: string;
  /** 解放後の挨拶 */
  greetingJa: string;
  greetingZh: string;
}

export interface Chapter1StoryBeat {
  beatId: string;
  textJa: string;
  textZh: string;
}

export interface Chapter1Quest {
  questId: string;
  order: number;
  titleJa: string;
  titleZh: string;
  /** RPG用語で学習内容を隠さない：何を学ぶかを直接表示する */
  learnGoalJa: string;
  learnGoalZh: string;
  estimatedMinutes: number;
  completionConditionJa: string;
  completionConditionZh: string;
  /** Quest開始前の物語（補助であり、学習目的の代わりにしない） */
  storyIntroJa: string;
  storyIntroZh: string;
  /** 完了後に起こる物語上の変化（§8: 必ず何かが変わる） */
  storyOutcomeJa: string;
  storyOutcomeZh: string;
  /** 実在教材ID（foundationVocabBank）。全問正解ではなく各Itemのチェック1回正解で充足 */
  learningItemIds: string[];
  unlocks: { locationIds: string[]; npcIds: string[]; storyBeatIds: string[] };
  /** このQuestの舞台となる場所（主人公の自動移動先） */
  siteLocationId: string;
  /** 章末の場面攻略（10問テストではなく会話場面で締める） */
  isChapterFinale: boolean;
  adventureXpReward: number;
}

export const CHAPTER1_ID = 'ch1-hajimari-no-machi';

/** 町の場所（オリジナル）。座標は見下ろしマップの配置用 */
export const CHAPTER1_LOCATIONS: Chapter1Location[] = [
  { locationId: 'c1-town-gate', nameJa: '町の入口', nameZh: '小镇入口', x: 18, y: 78 },
  { locationId: 'c1-main-street', nameJa: 'ことば通り', nameZh: '言叶大街', x: 42, y: 58 },
  { locationId: 'c1-plaza', nameJa: 'みなも広場', nameZh: '水面广场', x: 62, y: 40 },
  { locationId: 'c1-station-front', nameJa: '駅前', nameZh: '车站前', x: 84, y: 22 },
];

/** 登場人物（オリジナル・成人向けトーン） */
export const CHAPTER1_NPCS: Chapter1Npc[] = [
  { npcId: 'c1-npc-shoko', nameJa: '翔子先生', nameZh: '翔子老师', roleJa: '言葉の案内人',
    locationId: 'c1-town-gate',
    foggyLineJa: '（霧の向こうから誰かの声がする……）',
    greetingJa: 'ようこそ。ここから、あなたの言葉の旅が始まります。',
    greetingZh: '欢迎。你的语言之旅，从这里开始。' },
  { npcId: 'c1-npc-hana', nameJa: 'パン屋のハナさん', nameZh: '面包店的小花',
    roleJa: 'ことば通りのパン屋の店主', locationId: 'c1-main-street',
    foggyLineJa: '（お店の人が何か言っているが、霧で聞き取れない）',
    greetingJa: 'いらっしゃい。あなたが噂の旅の人ね。',
    greetingZh: '欢迎光临。你就是传闻中的旅人吧。' },
  { npcId: 'c1-npc-gen', nameJa: '駅員のゲンさん', nameZh: '车站的老玄',
    roleJa: '駅前の案内係', locationId: 'c1-station-front',
    foggyLineJa: '（時刻表の前で案内係が説明しているようだ……）',
    greetingJa: 'この駅から、次の町へ行けますよ。',
    greetingZh: '从这个车站，可以去下一个小镇哦。' },
];

/** 物語ビート（オリジナル・短文） */
export const CHAPTER1_STORY_BEATS: Chapter1StoryBeat[] = [
  { beatId: 'c1-beat-arrival',
    textJa: '深い霧に包まれた町に、あなたは着いた。看板の文字はにじみ、人の声はくぐもって聞こえる。',
    textZh: '你来到了被浓雾笼罩的小镇。招牌的文字模糊不清，人们的话语也听不真切。' },
  { beatId: 'c1-beat-shoko-meet',
    textJa: '霧の中に、一人だけはっきり見える人がいた。「私は翔子。言葉の案内人です」',
    textZh: '雾中只有一个人的身影格外清晰。「我叫翔子，是言叶的向导。」' },
  { beatId: 'c1-beat-name-told',
    textJa: 'あなたが名前を伝えると、翔子先生はうなずいた。「いい名前ですね。町のみんなにも教えてあげましょう」',
    textZh: '你说出名字后，翔子老师点了点头。「好名字。也让镇上的大家认识你吧。」' },
  { beatId: 'c1-beat-street-open',
    textJa: 'あいさつが通じた瞬間、ことば通りの霧がすっと晴れた。パンの焼ける匂いがする。',
    textZh: '问候传达到的那一刻，言叶大街的雾一下子散开了。空气里有烤面包的香味。' },
  { beatId: 'c1-beat-station-visible',
    textJa: '時間と場所を尋ねられるようになると、駅の方角がはっきり見えてきた。',
    textZh: '当你学会询问时间和地点，车站的方向渐渐清晰起来。' },
  { beatId: 'c1-beat-chapter-end',
    textJa: '駅前での会話が、初めて最後まで通じた。ゲンさんが微笑む。「次の町でも、きっと大丈夫」',
    textZh: '在车站前的对话，第一次完整地传达给了对方。老玄微笑着说：「到了下一个小镇，你也一定没问题。」' },
];

/** Chapter 1のQuest（5件・学習目的を必ず明示） */
export const CHAPTER1_QUESTS: Chapter1Quest[] = [
  { questId: 'c1q1-meet-shoko', order: 1,
    siteLocationId: 'c1-town-gate',
    titleJa: '翔子先生と出会う', titleZh: '与翔子老师相遇',
    learnGoalJa: '「先生」「会う」の2語を確認する', learnGoalZh: '确认「先生」「会う」这2个词',
    estimatedMinutes: 3,
    completionConditionJa: '2語のチェックに正解する', completionConditionZh: '答对2个词的确认题',
    storyIntroJa: '霧の向こうから声がする。まず、声の主に会いに行こう。',
    storyIntroZh: '雾的那头传来声音。先去见见声音的主人吧。',
    storyOutcomeJa: '翔子先生と出会った。町の入口の霧が晴れ、ことば通りへの道が見えた。',
    storyOutcomeZh: '你遇见了翔子老师。小镇入口的雾散了，通往言叶大街的路出现了。',
    learningItemIds: ['fi-sensei', 'fi-au'],
    unlocks: { locationIds: ['c1-main-street'], npcIds: ['c1-npc-shoko'], storyBeatIds: ['c1-beat-arrival', 'c1-beat-shoko-meet'] },
    isChapterFinale: false, adventureXpReward: 20 },
  { questId: 'c1q2-tell-name', order: 2,
    siteLocationId: 'c1-town-gate',
    titleJa: '自分の名前を伝える', titleZh: '告诉对方你的名字',
    learnGoalJa: '「名前」「話す」の2語で自己紹介の形を作る', learnGoalZh: '用「名前」「話す」学会自我介绍的形式',
    estimatedMinutes: 3,
    completionConditionJa: '2語のチェックに正解する', completionConditionZh: '答对2个词的确认题',
    storyIntroJa: '翔子先生が尋ねた。「あなたのお名前は？」',
    storyIntroZh: '翔子老师问道：「你叫什么名字？」',
    storyOutcomeJa: '名前が伝わった。翔子先生があなたを「旅の人」ではなく名前で呼ぶようになった。',
    storyOutcomeZh: '名字传达到了。翔子老师开始用名字称呼你，而不再是「旅人」。',
    learningItemIds: ['fi-namae', 'fi-hanasu'],
    unlocks: { locationIds: [], npcIds: [], storyBeatIds: ['c1-beat-name-told'] },
    isChapterFinale: false, adventureXpReward: 20 },
  { questId: 'c1q3-greet-town', order: 3,
    siteLocationId: 'c1-main-street',
    titleJa: '町の人へあいさつする', titleZh: '向镇上的人问好',
    learnGoalJa: '「元気」「友達」の2語であいさつと応答を確認する', learnGoalZh: '用「元気」「友達」确认问候和回应',
    estimatedMinutes: 4,
    completionConditionJa: '2語のチェックに正解する', completionConditionZh: '答对2个词的确认题',
    storyIntroJa: 'ことば通りのパン屋から、いい匂いがする。店の人に声をかけてみよう。',
    storyIntroZh: '言叶大街的面包店飘来香味。试着和店里的人打个招呼吧。',
    storyOutcomeJa: 'ハナさんと友達になった。通りの霧が晴れ、みなも広場が見えるようになった。',
    storyOutcomeZh: '你和小花成了朋友。大街的雾散了，能看到水面广场了。',
    learningItemIds: ['fi-genki', 'fi-tomodachi'],
    unlocks: { locationIds: ['c1-plaza'], npcIds: ['c1-npc-hana'], storyBeatIds: ['c1-beat-street-open'] },
    isChapterFinale: false, adventureXpReward: 25 },
  { questId: 'c1q4-ask-time-place', order: 4,
    siteLocationId: 'c1-plaza',
    titleJa: '時間と場所を尋ねる', titleZh: '询问时间和地点',
    learnGoalJa: '「何時」「駅」「行く」の3語で質問の形を作る', learnGoalZh: '用「何時」「駅」「行く」学会提问的形式',
    estimatedMinutes: 5,
    completionConditionJa: '3語のチェックに正解する', completionConditionZh: '答对3个词的确认题',
    storyIntroJa: '広場の掲示板に、次の町への電車のことが書いてあるらしい。まだ霧で読めない。',
    storyIntroZh: '广场的告示板上好像写着去下一个小镇的电车信息，但雾还没散，读不清。',
    storyOutcomeJa: '掲示板が読めた。駅の方角の霧が晴れ、駅前のゲンさんの姿が見えた。',
    storyOutcomeZh: '你读懂了告示板。车站方向的雾散了，能看到站前的老玄了。',
    learningItemIds: ['fi-nanji', 'fi-eki', 'fi-iku'],
    unlocks: { locationIds: ['c1-station-front'], npcIds: ['c1-npc-gen'], storyBeatIds: ['c1-beat-station-visible'] },
    isChapterFinale: false, adventureXpReward: 25 },
  { questId: 'c1q5-station-talk', order: 5,
    siteLocationId: 'c1-station-front',
    titleJa: '章末：駅前で会話を成立させる', titleZh: '章末：在车站前完成对话',
    learnGoalJa: '「来る」「学校」を加え、場面会話（あいさつ→名前→時間→行き先）を通す',
    learnGoalZh: '加上「来る」「学校」，完整走一遍场景对话（问候→名字→时间→目的地）',
    estimatedMinutes: 6,
    completionConditionJa: '2語のチェックと4ステップの場面会話をすべて成立させる',
    completionConditionZh: '答对2个词并完成4步场景对话',
    storyIntroJa: '駅前でゲンさんが待っている。今まで学んだ言葉で、会話を最後まで通してみよう。',
    storyIntroZh: '老玄在车站前等着。用学过的词，试着把对话完整进行到最后吧。',
    storyOutcomeJa: '会話が最後まで通じた。Chapter 1完了。次の町への切符を手に入れた。',
    storyOutcomeZh: '对话完整地传达到了。第一章完成。你拿到了去下一个小镇的车票。',
    learningItemIds: ['fi-kuru', 'fi-gakkou'],
    unlocks: { locationIds: [], npcIds: [], storyBeatIds: ['c1-beat-chapter-end'] },
    isChapterFinale: true, adventureXpReward: 40 },
];

/** 章末の場面会話ステップ（10問テストではなく場面攻略）。stepの選択肢はすべて学習済みItemの語 */
export interface FinaleStep {
  stepId: string;
  npcLineJa: string;
  npcLineZh: string;
  /** 正しい応答（学習済み語を含む） */
  correctJa: string;
  optionsJa: string[];
  usesItemId: string;
}

export const CHAPTER1_FINALE_STEPS: FinaleStep[] = [
  { stepId: 'c1f-greet', npcLineJa: 'こんにちは。お元気ですか。', npcLineZh: '你好。你好吗？',
    correctJa: 'はい、元気です。', usesItemId: 'fi-genki',
    optionsJa: ['はい、元気です。', 'はい、駅です。', 'はい、名前です。'] },
  { stepId: 'c1f-name', npcLineJa: 'お名前は何ですか。', npcLineZh: '你叫什么名字？',
    correctJa: '名前は（あなた）です。', usesItemId: 'fi-namae',
    optionsJa: ['名前は（あなた）です。', '学校は（あなた）です。', '電車は（あなた）です。'] },
  { stepId: 'c1f-time', npcLineJa: '次の電車は3時です。今、何時ですか。', npcLineZh: '下一班电车3点发车。现在几点？',
    correctJa: '今、2時です。', usesItemId: 'fi-nanji',
    optionsJa: ['今、2時です。', '今、駅です。', '今、友達です。'] },
  { stepId: 'c1f-place', npcLineJa: 'どこへ行きますか。', npcLineZh: '你要去哪里？',
    correctJa: '学校へ行きます。', usesItemId: 'fi-iku',
    optionsJa: ['学校へ行きます。', '学校を寝ます。', '学校が来ます。'] },
];

export const chapter1QuestById = (id: string): Chapter1Quest | undefined =>
  CHAPTER1_QUESTS.find(q => q.questId === id);
