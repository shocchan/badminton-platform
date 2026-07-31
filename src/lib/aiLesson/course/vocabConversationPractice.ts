// 語彙会話練習データ（Phase 2C++ §9・全draft）。
// 実LLM会話への接続はEdge session設計（通常会話履歴・利用上限との分離）が必要なためPhase 2E。
// 本データは①スクリプト練習モード（決定的・保存なし）②将来のpractice contextの両方で使う。
export interface VocabularyConversationPractice {
  itemId: string;
  senseId?: string;
  themeJa: string; themeZh: string;
  starterQuestionJa: string; starterQuestionZh: string;
  targetExpressions: string[];          // 判定は部分一致（決定的・LLMなし）
  supportExpressionsJa: string[];
  supportExpressionsZh: string[];
  followUpQuestionJa: string;           // 対象表現を使えた後の再使用促し（§10）
  followUpQuestionZh: string;
  estimatedMinutes: number;
  practiceType: 'vocabulary';
  reviewStatus: 'draft';
}

const d = (p: Omit<VocabularyConversationPractice, 'practiceType' | 'reviewStatus' | 'estimatedMinutes'> & { estimatedMinutes?: number }): VocabularyConversationPractice =>
  ({ estimatedMinutes: 3, practiceType: 'vocabulary', reviewStatus: 'draft', ...p });

export const VOCAB_CONVERSATION_PRACTICES: VocabularyConversationPractice[] = [
  d({ itemId: 'fi-sumu', themeJa: '今住んでいる場所について話す', themeZh: '聊聊你现在居住的地方',
    starterQuestionJa: '今、どこに住んでいますか？', starterQuestionZh: '你现在住在哪里？',
    targetExpressions: ['に住んでいます', 'に住んで'],
    supportExpressionsJa: ['今は〜に住んでいます', '〜と一緒に住んでいます', '〜に住んで1年です'],
    supportExpressionsZh: ['我现在住在〜', '和〜一起住', '住在〜一年了'],
    followUpQuestionJa: '前は どこに住んでいましたか？', followUpQuestionZh: '之前住在哪里呢？' }),
  d({ itemId: 'fi-iku', themeJa: 'よく行く場所について話す', themeZh: '聊聊你常去的地方',
    starterQuestionJa: '週末、よくどこに行きますか？', starterQuestionZh: '周末你常去哪里？',
    targetExpressions: ['に行きます', 'へ行きます', 'に行って'],
    supportExpressionsJa: ['よく〜に行きます', '友達と〜に行きます', '月に1回〜へ行きます'],
    supportExpressionsZh: ['我常去〜', '和朋友去〜', '一个月去一次〜'],
    followUpQuestionJa: 'そこへは だれと行きますか？', followUpQuestionZh: '你和谁一起去呢？' }),
  d({ itemId: 'fi-kuru', themeJa: '日本に来たことについて話す', themeZh: '聊聊你来日本的经历',
    starterQuestionJa: 'いつ日本に来ましたか？', starterQuestionZh: '你是什么时候来日本的？',
    targetExpressions: ['に来ました', 'に来て'],
    supportExpressionsJa: ['〜年に日本に来ました', '仕事で来ました', '家族と来ました'],
    supportExpressionsZh: ['〜年来到日本', '因为工作来的', '和家人一起来的'],
    followUpQuestionJa: '日本に来て、どうですか？', followUpQuestionZh: '来日本之后感觉怎么样？' }),
  d({ itemId: 'fi-taberu', themeJa: '朝ごはんについて話す', themeZh: '聊聊你的早餐',
    starterQuestionJa: '今朝、何を食べましたか？', starterQuestionZh: '今天早上你吃了什么？',
    targetExpressions: ['を食べました', 'を食べます'],
    supportExpressionsJa: ['今朝は〜を食べました', 'いつも〜を食べます', '何も食べませんでした'],
    supportExpressionsZh: ['今天早上吃了〜', '平时吃〜', '什么都没吃'],
    followUpQuestionJa: '日本の食べ物で、何が好きですか？', followUpQuestionZh: '日本的食物里你喜欢什么？' }),
  d({ itemId: 'fi-hataraku', themeJa: '仕事について話す', themeZh: '聊聊你的工作',
    starterQuestionJa: 'どこで働いていますか？', starterQuestionZh: '你在哪里工作？',
    targetExpressions: ['で働いています', 'で働いて'],
    supportExpressionsJa: ['〜で働いています', '〜の会社で働いています', '週5日働いています'],
    supportExpressionsZh: ['我在〜工作', '在〜的公司工作', '一周工作5天'],
    followUpQuestionJa: '仕事は 何時からですか？', followUpQuestionZh: '几点开始工作呢？' }),
  d({ itemId: 'fi-benkyo', themeJa: '日本語の勉強について話す', themeZh: '聊聊你的日语学习',
    starterQuestionJa: 'いつ日本語を勉強していますか？', starterQuestionZh: '你都什么时候学日语？',
    targetExpressions: ['を勉強して', 'を勉強します'],
    supportExpressionsJa: ['毎晩日本語を勉強しています', '週末に勉強します', '30分だけ勉強します'],
    supportExpressionsZh: ['每天晚上学日语', '周末学习', '只学30分钟'],
    followUpQuestionJa: 'どうやって勉強していますか？', followUpQuestionZh: '你是怎么学习的？' }),
  d({ itemId: 'fi-nomu', themeJa: '好きな飲み物について話す', themeZh: '聊聊你喜欢的饮品',
    starterQuestionJa: '朝、何を飲みますか？', starterQuestionZh: '早上你喝什么？',
    targetExpressions: ['を飲みます', 'を飲んで'],
    supportExpressionsJa: ['毎朝〜を飲みます', 'コーヒーをよく飲みます', 'お酒は飲みません'],
    supportExpressionsZh: ['每天早上喝〜', '常喝咖啡', '不喝酒'],
    followUpQuestionJa: '夜は 何か飲みますか？', followUpQuestionZh: '晚上会喝点什么吗？' }),
  d({ itemId: 'fi-miru', themeJa: 'よく見るものについて話す', themeZh: '聊聊你常看的东西',
    starterQuestionJa: '夜、よく何を見ますか？', starterQuestionZh: '晚上你常看什么？',
    targetExpressions: ['を見ます', 'を見て'],
    supportExpressionsJa: ['ドラマを見ます', '動画をよく見ます', '週末に映画を見ます'],
    supportExpressionsZh: ['看电视剧', '常看视频', '周末看电影'],
    followUpQuestionJa: '最近、何を見ましたか？', followUpQuestionZh: '最近看了什么？' }),
  d({ itemId: 'fi-kiku', themeJa: '音楽について話す', themeZh: '聊聊音乐',
    starterQuestionJa: 'どんな音楽を聞きますか？', starterQuestionZh: '你听什么样的音乐？',
    targetExpressions: ['を聞きます', 'を聞いて'],
    supportExpressionsJa: ['中国の音楽を聞きます', '電車で音楽を聞きます', '寝る前に聞きます'],
    supportExpressionsZh: ['听中国的音乐', '在电车上听音乐', '睡前听'],
    followUpQuestionJa: 'いつ音楽を聞きますか？', followUpQuestionZh: '你都什么时候听音乐？' }),
  d({ itemId: 'fi-hanasu', themeJa: '日本語を話す場面について話す', themeZh: '聊聊你说日语的场景',
    starterQuestionJa: 'だれと日本語を話しますか？', starterQuestionZh: '你和谁说日语？',
    targetExpressions: ['と話します', 'を話します', 'と話して'],
    supportExpressionsJa: ['会社の人と話します', '少しだけ話します', '毎日日本語を話します'],
    supportExpressionsZh: ['和公司的人说', '只说一点点', '每天都说日语'],
    followUpQuestionJa: '日本語で話すとき、何が難しいですか？', followUpQuestionZh: '用日语交流时觉得什么最难？' }),
  d({ itemId: 'fi-ookii', themeJa: '大きい・小さいで身の回りを説明する', themeZh: '用大小来描述身边的东西',
    starterQuestionJa: 'あなたの家は大きいですか？', starterQuestionZh: '你住的地方大吗？',
    targetExpressions: ['大きい', '小さい'],
    supportExpressionsJa: ['少し大きいです', 'とても小さいです', '大きくないです'],
    supportExpressionsZh: ['有点大', '非常小', '不大'],
    followUpQuestionJa: '会社（学校）は 大きいですか？', followUpQuestionZh: '你的公司（学校）大吗？' }),
  d({ itemId: 'fi-atsui', themeJa: '暑さ・寒さについて話す', themeZh: '聊聊冷热天气',
    starterQuestionJa: '今日は暑いですか？寒いですか？', starterQuestionZh: '今天热还是冷？',
    targetExpressions: ['暑い', '寒い'],
    supportExpressionsJa: ['今日はとても暑いです', '冬は寒いです', '中国より暑いです'],
    supportExpressionsZh: ['今天非常热', '冬天很冷', '比中国热'],
    followUpQuestionJa: 'あなたの故郷は 夏、暑いですか？', followUpQuestionZh: '你的家乡夏天热吗？' }),
  // 会話コア11語の接続を閉じる（Phase 2E-1.10 §11）。「先生」は日本語の敬称の使い分けが会話で誤りやすい
  d({ itemId: 'fi-sensei', themeJa: '習っている先生について話す', themeZh: '聊聊教你的老师',
    starterQuestionJa: '日本語は、だれに習っていますか？', starterQuestionZh: '你的日语是跟谁学的？',
    targetExpressions: ['先生に', '先生です', '先生は'],
    supportExpressionsJa: ['〜先生に習っています', '先生はやさしいです', '週に1回、先生と話します'],
    supportExpressionsZh: ['我跟〜老师学', '老师很温柔', '每周和老师说一次话'],
    followUpQuestionJa: '先生は どんな人ですか？', followUpQuestionZh: '老师是什么样的人呢？' }),
];

// Phase 3P-3: contextual接続の全140語化。既存13語（上記）は変更せず、
// 未接続127語を4バッチで追加した（全draft・判定規則/復習規則は不変）。
import { VOCAB_CONVERSATION_PRACTICES_BATCH1 } from './vocabConversationPractice2';
import { VOCAB_CONVERSATION_PRACTICES_BATCH2 } from './vocabConversationPractice3';
import { VOCAB_CONVERSATION_PRACTICES_BATCH3 } from './vocabConversationPractice4';
import { VOCAB_CONVERSATION_PRACTICES_BATCH4 } from './vocabConversationPractice5';

export const ALL_CONVERSATION_PRACTICES: VocabularyConversationPractice[] = [
  ...VOCAB_CONVERSATION_PRACTICES,
  ...VOCAB_CONVERSATION_PRACTICES_BATCH1,
  ...VOCAB_CONVERSATION_PRACTICES_BATCH2,
  ...VOCAB_CONVERSATION_PRACTICES_BATCH3,
  ...VOCAB_CONVERSATION_PRACTICES_BATCH4,
];

export const practiceForItem = (itemId: string): VocabularyConversationPractice | undefined =>
  ALL_CONVERSATION_PRACTICES.find((p) => p.itemId === itemId);
