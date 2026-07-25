// モック版チューター（OpenAI API 未接続）
// TutorEngine インターフェース（tutorEngine.ts）を実装する。
// AI接続時は createApiTutor / createVoiceTutor に差し替えるだけで LessonChat 側は変更不要。
//
// モックの範囲で実現していること:
// - 生徒の回答キーワードを短く拾って受け止めてから、1ターン1質問で進行
// - 定型文の連続使用を避ける（受け止め表現をローテーション）
// - 目標表現の使用判定（自力 / 選択肢・ヒントあり）と再挑戦への自然な誘導
// - 「分かりません」やヒント要求への段階的サポート（言い換え→語句→選択肢→一部→完成例→復唱）
// - 中国語で回答された場合、日本語のモデル文へ変換して復唱を促す
// - テーマから外れた話も一度受け止め、目標表現と関連づけて戻す

import type {
  CorrectionRecord,
  ExpressionRecord,
  LearningPlan,
  LessonPhase,
  LessonSessionState,
  QuickReply,
  TutorTurn,
} from './types';
import type { ReplyOptions, TutorEngine, TutorOutcome } from './tutorEngine';

export type { TutorOutcome } from './tutorEngine';

/** 1つの質問（段階的サポートの材料つき） */
interface QA {
  id: string;
  text: string;
  zh: string;
  /** サポート段階1: 短く簡単な言い換え */
  simple: string;
  /** サポート段階2: 重要語句の言い換え・説明 */
  rephrase: string;
  /** 選択肢（2〜4個）。目標表現入りが1つも無ければ動的に補われる */
  quick: string[];
}

interface ThemeScript {
  warmup: QA;
  talk: QA[];
  bonus: { label: string; zhMeaning: string; example: string };
}

const THEME_SCRIPTS: Record<string, ThemeScript> = {
  daily: {
    warmup: {
      id: 'daily-w',
      text: 'こんにちは！今日は何をしましたか？',
      zh: '你好！今天做了什么？',
      simple: '今日、何をしましたか？',
      rephrase: '「今日したこと」＝今天做的事。朝から今まで、何かひとつ教えてください。',
      quick: ['仕事をしました', '買い物に行きました', '家でゆっくりしました'],
    },
    talk: [
      {
        id: 'daily-1',
        text: '最近、できるようになったことはありますか？',
        zh: '最近有什么变得会做的事吗？',
        simple: '最近、新しくできることはありますか？',
        rephrase: '「できるようになったこと」＝以前不会、现在会了的事。',
        quick: ['日本語で注文できるようになりました', '日本人と話せるようになりました', '料理が上手になりました'],
      },
      {
        id: 'daily-2',
        text: 'それはいつからですか？もう少し教えてください。',
        zh: '那是从什么时候开始的？再多说一点。',
        simple: 'いつからですか？',
        rephrase: '「いつから」＝从什么时候开始。先月？今年？',
        quick: ['先月からです', '今年からです', '最近です'],
      },
    ],
    bonus: { label: '「最近」', zhMeaning: '最近', example: '最近、朝早く起きています。' },
  },
  badminton: {
    warmup: {
      id: 'bad-w',
      text: 'こんにちは！最近、バドミントンの練習はしましたか？',
      zh: '你好！最近打羽毛球了吗？',
      simple: '最近、バドミントンをしましたか？',
      rephrase: '「練習」＝练习。最近、体育館へ行きましたか？',
      quick: ['はい、練習しました！', '久しぶりに練習しました', '最近はしていません'],
    },
    talk: [
      {
        id: 'bad-1',
        text: '練習して、前よりできるようになったことはありますか？',
        zh: '通过练习，有什么比以前做得更好的吗？',
        simple: '前より上手になったことはありますか？',
        rephrase: '「前より」＝比以前。スマッシュ？サーブ？レシーブ？',
        quick: ['日本語で注文できるようになりました', '日本人と話せるようになりました', 'バドミントンが上手になりました'],
      },
      {
        id: 'bad-2',
        text: '大会や交流会には出てみたいですか？',
        zh: '想参加比赛或交流会吗？',
        simple: '大会に出たいですか？',
        rephrase: '「大会」＝比赛。「出る」＝参加。',
        quick: ['はい、出てみたいです', 'ちょっと緊張します', 'もう出たことがあります'],
      },
    ],
    bonus: { label: '「久しぶりに」', zhMeaning: '隔了好久（才…）', example: '久しぶりに体育館で練習しました。' },
  },
  friends: {
    warmup: {
      id: 'fri-w',
      text: 'こんにちは！今週末は何か予定がありますか？',
      zh: '你好！这周末有什么安排吗？',
      simple: '週末、何をしますか？',
      rephrase: '「予定」＝安排、计划。土曜日と日曜日のことです。',
      quick: ['友だちと出かけます', '家でゆっくりします', 'まだ決めていません'],
    },
    talk: [
      {
        id: 'fri-1',
        text: '友だちと話して、できるようになったことはありますか？',
        zh: '和朋友交流后，有什么变得会做的吗？',
        simple: '友だちと日本語で話せますか？',
        rephrase: '「できるようになった」＝变得会…了。',
        quick: ['日本人と話せるようになりました', '冗談が分かるようになりました', 'まだ難しいです'],
      },
      {
        id: 'fri-2',
        text: '友だちとはどんな話をすることが多いですか？',
        zh: '和朋友聊得最多的是什么话题？',
        simple: '友だちと何を話しますか？',
        rephrase: '「どんな話」＝什么样的话题。仕事？趣味？',
        quick: ['趣味の話が多いです', '仕事の話をします', '食べ物の話が好きです'],
      },
    ],
    bonus: { label: '「〜する予定です」', zhMeaning: '打算…／计划…', example: '土曜日に友だちと出かける予定です。' },
  },
  work: {
    warmup: {
      id: 'work-w',
      text: 'こんにちは！お仕事は忙しいですか？',
      zh: '你好！最近工作忙吗？',
      simple: '仕事は忙しいですか？',
      rephrase: '「忙しい」＝忙。最近の仕事のことです。',
      quick: ['はい、忙しいです', 'ちょうどいいです', '今週は少し楽です'],
    },
    talk: [
      {
        id: 'work-1',
        text: '仕事で、できるようになったことはありますか？',
        zh: '在工作上有什么变得会做的吗？',
        simple: '仕事で新しくできることはありますか？',
        rephrase: '「できるようになった」＝变得会…了。日本語の電話？メール？',
        quick: ['日本語で電話できるようになりました', 'メールが書けるようになりました', '会議で発言できるようになりました'],
      },
      {
        id: 'work-2',
        text: '仕事で日本語を使う場面はありますか？',
        zh: '工作中有用日语的场合吗？',
        simple: '仕事で日本語を使いますか？',
        rephrase: '「場面」＝场合。会議？お客様との会話？',
        quick: ['会議で使います', 'お客様と話します', 'あまり使いません'],
      },
    ],
    bonus: { label: '「打ち合わせ」', zhMeaning: '（工作上的）碰头会、商谈', example: '午後は打ち合わせが2つあります。' },
  },
  interview: {
    warmup: {
      id: 'int-w',
      text: 'こんにちは！まず、簡単に自己紹介をしてみましょう。',
      zh: '你好！先来简单做个自我介绍吧。',
      simple: 'お名前と、していることを教えてください。',
      rephrase: '「自己紹介」＝自我介绍。名前・仕事・趣味を1つずつ。',
      quick: ['王と申します。会社員です', '留学生です。日本語を勉強しています', 'バドミントンが趣味です'],
    },
    talk: [
      {
        id: 'int-1',
        text: '日本語で、できるようになったことを1つ教えてください。',
        zh: '请说一件你用日语变得会做的事。',
        simple: '日本語で何ができますか？',
        rephrase: '「できるようになった」＝变得会…了。面接でよく聞かれます。',
        quick: ['日本語で面接の練習ができるようになりました', '敬語が使えるようになりました', '自己紹介ができるようになりました'],
      },
      {
        id: 'int-2',
        text: 'あなたの強みを1つ、教えてください。',
        zh: '请说一个你的优点。',
        simple: '得意なことは何ですか？',
        rephrase: '「強み」＝优点、强项。',
        quick: ['あきらめないことです', 'コミュニケーションが得意です', '毎日コツコツ努力できます'],
      },
    ],
    bonus: { label: '「〜と申します」', zhMeaning: '我叫…（郑重的自我介绍）', example: '王と申します。よろしくお願いします。' },
  },
  presentation: {
    warmup: {
      id: 'pre-w',
      text: 'こんにちは！あなたの好きなことを1つ教えてください。',
      zh: '你好！请告诉我一件你喜欢的事。',
      simple: '好きなことは何ですか？',
      rephrase: '「好きなこと」＝喜欢的事。スポーツ？音楽？料理？',
      quick: ['バドミントンが好きです', '料理が好きです', '旅行が好きです'],
    },
    talk: [
      {
        id: 'pre-1',
        text: 'それを続けて、できるようになったことはありますか？',
        zh: '坚持下来后，有什么变得会做的吗？',
        simple: '続けて、上手になったことはありますか？',
        rephrase: '「続けて」＝坚持下来。少しずつ上手になったこと。',
        quick: ['人前で話せるようになりました', '毎日続けられるようになりました', '友だちに教えられるようになりました'],
      },
      {
        id: 'pre-2',
        text: 'それのどんなところが好きですか？',
        zh: '你喜欢它的哪一点？',
        simple: 'どうして好きですか？',
        rephrase: '「どんなところ」＝哪一点、什么地方。',
        quick: ['楽しいところです', '友だちができるところです', '上手になるのがうれしいです'],
      },
    ],
    bonus: { label: '「特に」', zhMeaning: '特别是、尤其', example: '特にダブルスの試合が好きです。' },
  },
};

/** 回答キーワード → 短い受け止め（回答内容とずれた褒め方をしないための対応表） */
const KEYWORD_ACKS: { re: RegExp; ack: string }[] = [
  { re: /負け|まけ/, ack: 'そうでしたか。悔しかったですね。' },
  { re: /勝|かちました|かった/, ack: '勝ったんですね！おめでとうございます。' },
  { re: /大会|試合/, ack: '試合の話ですね！' },
  { re: /緊張/, ack: '緊張しますよね。よく分かります。' },
  { re: /楽し/, ack: '楽しそうですね！' },
  { re: /難し|むずかし/, ack: 'たしかに難しいですよね。' },
  { re: /疲れ|忙し/, ack: 'おつかれさまです。無理しないでくださいね。' },
  { re: /練習/, ack: 'しっかり練習していますね。' },
  { re: /注文/, ack: '注文できると便利ですよね。' },
  { re: /話せる|話せます|話せるように/, ack: '話せるとうれしいですよね。' },
  { re: /スマッシュ|サーブ|レシーブ|クリア/, ack: 'いいショットですね！' },
  { re: /仕事/, ack: 'お仕事でもがんばっていますね。' },
  { re: /友だち|友達/, ack: 'いい友だちですね。' },
  { re: /好き/, ack: 'いいですね、好きなことがあるのは素敵です。' },
  { re: /していません|してない|行けて|できなかった/, ack: 'そうですか。それも正直でいいですよ。' },
];

/** 汎用の受け止め（連続で同じものを使わないようローテーション） */
const GENERIC_ACKS = ['なるほど。', 'そうなんですね。', 'いいですね。', '教えてくれてありがとうございます。'];

/** 目標表現への再挑戦の言い回し（ローテーション） */
const RECHALLENGE_TEMPLATES = [
  (label: string, example: string) =>
    `その話、今日の${label}が使えますよ。例えば「${example}」。あなたのことばで言ってみましょう。`,
  (label: string, example: string) =>
    `いい流れです！ここで${label}に挑戦してみましょう。お手本：「${example}」`,
];

/** ちょっと広がった話への受け止め＋テーマへの自然な戻し */
const OFFTOPIC_TIEBACKS = [
  (label: string) => `その話も面白いですね。今日は${label}を練習しているので、その話でこの表現を使ってみましょう。`,
  (label: string) => `なるほど、そういうこともあるんですね。では、いまの話を${label}を使って言えるか挑戦してみましょう。`,
];

/** 「分かりません」系の検出 */
const DONT_KNOW_RE = /分かりません|わかりません|わからない|分からない|不知道|听不懂|むずかしいです。?$/;

/** ひらがな・カタカナを含むか */
const hasKana = (s: string) => /[ぁ-んァ-ヶ]/.test(s);
/** 簡体字など中国語特有の文字を含むか（日本語の漢字と形が異なるものだけ） */
const CN_CHARS_RE = /[说们还这问谢现时习语对么吗呢关兴让觉应该赛业极为]/;
/** 中国語での回答らしいか（漢字のみ＋中国語特有文字、または漢字のみで長い） */
const isLikelyChinese = (s: string) =>
  /[一-鿿]/.test(s) && !hasKana(s) && (CN_CHARS_RE.test(s) || s.length >= 8);

export const createMockTutor = (plan: LearningPlan): TutorEngine => {
  const script = THEME_SCRIPTS[plan.themeKey] ?? THEME_SCRIPTS.daily;
  const target = plan.target;
  const zhLevel = plan.zhSupport;

  // ── セッション状態（types.ts の LessonSessionState と同じモデル） ──
  const state: LessonSessionState = {
    themeKey: plan.themeKey,
    targetLabel: target.label,
    estimatedLevel: plan.estimatedLevel,
    zhSupport: plan.zhSupport,
    correction: plan.correction,
    phase: 'warmup',
    remainingSeconds: null,
    currentQuestionId: script.warmup.id,
    shouldWrapUp: false,
    targetUseCount: 0,
    targetUsage: null,
    hintLevel: 0,
    silenceCount: 0, // テキストモードでは常に0（音声モードで無音検知時に加算する）
    zhExplainCount: 0,
    offTopicCount: 0,
    restatementDone: false,
  };

  let talkIndex = -1; // 現在の talk 質問（-1 = まだ warmup）
  let genericAckIdx = 0;
  let rechallengeIdx = 0;
  let offTopicIdx = 0;
  let answeredCount = 0;
  let hintButtonUsed = false;
  let longestUserText = '';
  const corrections: CorrectionRecord[] = [];

  const currentQA = (): QA =>
    talkIndex < 0 ? script.warmup : script.talk[Math.min(talkIndex, script.talk.length - 1)];

  /** zhサポート設定に応じた中国語補足 */
  const zh = (note: string, context: 'always' | 'grammar' | 'chat' = 'chat'): string | undefined => {
    if (context === 'always') return note;
    if (zhLevel === 'often') return note;
    if (zhLevel === 'grammar' && context === 'grammar') return note;
    return undefined;
  };

  /** 選択肢に目標表現入りが無ければ、お手本の文を1つ足す（選択肢だけでミッション達成できる保証） */
  const withTargetChip = (quick: string[]): QuickReply[] => {
    const chips = quick.some((q) => target.detect.test(q)) ? quick : [...quick, target.example];
    return chips.map((text) => ({ text }));
  };

  /** 受け止め: キーワードが拾えればそれを、無ければ汎用をローテーション */
  const ackFor = (text: string): string => {
    const hit = KEYWORD_ACKS.find((k) => k.re.test(text));
    if (hit) return hit.ack;
    const ack = GENERIC_ACKS[genericAckIdx % GENERIC_ACKS.length];
    genericAckIdx += 1;
    return ack;
  };

  /** 次の質問へ進む（1ターンに質問は1つだけ） */
  const nextQuestionTurn = (ack: string): TutorTurn => {
    talkIndex += 1;
    if (talkIndex < script.talk.length) {
      const qa = script.talk[talkIndex];
      state.currentQuestionId = qa.id;
      state.hintLevel = 0;
      return {
        messages: [{ role: 'tutor', text: `${ack} ${qa.text}`, zhNote: zh(qa.zh) }],
        quickReplies: withTargetChip(qa.quick),
      };
    }
    // 質問を使い切ったら深掘りで発話量を増やす
    const followUps = [
      'それについて、もう1文つけたして説明してみましょう。',
      'いいですね。それはどうしてですか？',
      'この調子です。ほかに話したいことはありますか？',
    ];
    const q = followUps[(talkIndex - script.talk.length) % followUps.length];
    return { messages: [{ role: 'tutor', text: `${ack} ${q}` }] };
  };

  /** 目標表現が使えたときの応答（回数で言い方を変える） */
  const praiseTurn = (usage: 'self' | 'hint'): TutorTurn => {
    state.targetUseCount += 1;
    if (state.targetUsage === null) state.targetUsage = usage;
    const first =
      usage === 'self'
        ? `すごい！${target.label}が自分のことばで使えましたね！🎉`
        : `いいですね！${target.label}が使えました。次は自分のことばでも挑戦してみましょう。`;
    const again = `${target.label}、2回目も使えましたね！もう身についてきましたよ。`;
    const praise = state.targetUseCount === 1 ? first : again;

    if (state.phase === 'wrapup') {
      state.restatementDone = true;
      return {
        messages: [{ role: 'tutor', kind: 'praise', text: `${praise} 今日はここまでよく話せました。`, zhNote: zh('说得很好！今天就到这里。') }],
      };
    }
    const next = nextQuestionTurn('では、');
    return {
      messages: [
        { role: 'tutor', kind: 'praise', text: praise, zhNote: zh(usage === 'self' ? '太棒了！你独立用出了目标句型！' : '很好！下次试试不看提示自己说。') },
        ...next.messages,
      ],
      quickReplies: next.quickReplies,
    };
  };

  /** 段階的サポート（§7: 言い換え→語句→選択肢→一部提示→完成例→復唱） */
  const supportTurn = (): TutorTurn => {
    state.hintLevel = Math.min(state.hintLevel + 1, 6);
    const qa = currentQA();
    const core = target.label.replace(/[「」〜]/g, '');
    switch (state.hintLevel) {
      case 1:
        return { messages: [{ role: 'tutor', kind: 'hint', text: `大丈夫ですよ。もう一度、簡単に聞きますね。${qa.simple}`, zhNote: zh('别担心，我再简单问一遍。', 'always') }] };
      case 2:
        return { messages: [{ role: 'tutor', kind: 'hint', text: `ことばを言い換えますね。${qa.rephrase}`, zhNote: zh(qa.zh, 'always') }] };
      case 3:
        return {
          messages: [{ role: 'tutor', kind: 'hint', text: 'この中から選んでみましょう。近いものでいいですよ。' }],
          quickReplies: withTargetChip(qa.quick),
        };
      case 4:
        return { messages: [{ role: 'tutor', kind: 'hint', text: `文の形はこうです：「（毎週）練習して、＿＿＿${core}」。＿＿＿にあなたのことばを入れてみましょう。`, zhNote: zh(target.zhMeaning, 'always') }] };
      case 5:
        return {
          messages: [{ role: 'tutor', kind: 'hint', text: `完成した文はこうです：「${target.example}」。この通りでいいので、言ってみましょう。`, zhNote: zh(target.zhExample, 'always') }],
          quickReplies: [{ text: target.example }],
        };
      default:
        return {
          messages: [{ role: 'tutor', kind: 'hint', text: `ゆっくりで大丈夫です。「${target.example}」——そのまま真似して言ってみましょう。` }],
          quickReplies: [{ text: target.example }],
        };
    }
  };

  /** 中国語で回答された場合: 日本語モデル文へ変換して復唱を促す（§8） */
  const chineseAnswerTurn = (): TutorTurn => {
    state.zhExplainCount += 1;
    return {
      messages: [
        {
          role: 'tutor',
          kind: 'correction',
          text: `なるほど、伝わりましたよ。日本語では、例えば\n「${target.example}」\nのように言えます。あなたの話に合わせて、ゆっくり言ってみましょう。`,
          zhNote: '我明白你的意思了。试着把它换成日语说说看，慢慢来。',
        },
      ],
      quickReplies: [{ text: target.example }],
    };
  };

  return {
    start(): TutorTurn {
      // 導入: 挨拶 → 今日のテーマ・目標表現の宣言（音声モードでも同じ流れ）
      return {
        messages: [
          {
            role: 'tutor',
            kind: 'phase',
            text: `こんにちは！今日は ${target.label} を練習します。まずはウォームアップから。${script.warmup.text}`,
            zhNote: zh(`今天练习 ${target.label}。先热身：${script.warmup.zh}`),
          },
        ],
        quickReplies: withTargetChip(script.warmup.quick),
      };
    },

    onPhase(next: LessonPhase): TutorTurn {
      state.phase = next;
      switch (next) {
        case 'teach':
          state.hintLevel = 0;
          return {
            messages: [
              {
                role: 'tutor',
                kind: 'phase',
                text: `ここで今日の目標表現です！ ${target.label}\n例：「${target.example}」\nこのあとの会話で、1回使ってみましょう。`,
                zhNote: zh(`${target.zhMeaning}\n例句：${target.zhExample}`, 'grammar'),
              },
            ],
          };
        case 'talk': {
          const turn = nextQuestionTurn('では、会話の時間です。');
          return turn;
        }
        case 'wrapup': {
          state.shouldWrapUp = true;
          if (state.targetUseCount === 0 && longestUserText) {
            // 言い直し: 一番長い発話を目標表現入りのモデル文で言い直させる
            corrections.push({
              original: longestUserText,
              corrected: target.example,
              zhNote: `试着用 ${target.label} 改说一遍。`,
            });
            return {
              messages: [
                {
                  role: 'tutor',
                  kind: 'correction',
                  text: `最後に言い直しの練習です。さっきの「${longestUserText}」、${target.label}を使うと\n「${target.example}」\nと言えます。もう一度、声に出してみましょう！`,
                  zhNote: zh(`把刚才的话用 ${target.label} 改说一遍试试。`, 'grammar'),
                },
              ],
              quickReplies: [{ text: target.example }],
            };
          }
          return {
            messages: [
              {
                role: 'tutor',
                kind: 'phase',
                text: `今日のまとめです。「${target.label}」${state.targetUseCount > 0 ? 'が会話の中で使えました。すばらしい！' : 'を練習しました。'}明日、もう一度この表現を復習しましょう。「レッスンを終了する」を押すとレポートが見られます。`,
                zhNote: zh('今天辛苦啦！明天再复习一次今天的句型。点「结束课程」查看学习报告。'),
              },
            ],
          };
        }
        default:
          return { messages: [] };
      }
    },

    reply(userText: string, opts?: ReplyOptions): TutorTurn {
      const text = userText.trim();
      answeredCount += 1;
      if (text.length > longestUserText.length && !target.detect.test(text)) {
        longestUserText = text;
      }

      // ① 中国語での回答 → 日本語へ変換して復唱を促す
      if (isLikelyChinese(text)) return chineseAnswerTurn();

      // ② 「分かりません」→ 段階的サポート
      if (DONT_KNOW_RE.test(text)) return supportTurn();

      // ③ 目標表現が使えた（チップ経由・ヒント後は「ヒントあり」扱い）
      if (target.detect.test(text)) {
        const assisted = opts?.viaQuickReply || hintButtonUsed || state.hintLevel > 0;
        return praiseTurn(assisted ? 'hint' : 'self');
      }

      // ④ 短すぎる回答 → ふくらませる（受け止め＋質問1つ）
      if (text.length < 5) {
        return {
          messages: [{ role: 'tutor', text: `${ackFor(text)} もう少しくわしく教えてください。いつ？だれと？どうでしたか？`, zhNote: zh('再说得具体一点：什么时候？和谁？怎么样？') }],
        };
      }

      const ack = ackFor(text);

      // ⑤ まだ目標表現が出ていない場合、2回に1回は自然に再挑戦へ誘導（受け止め→誘導）
      if (state.phase !== 'wrapup' && state.targetUseCount === 0 && answeredCount >= 2 && rechallengeIdx < RECHALLENGE_TEMPLATES.length) {
        const isOffTopic = !KEYWORD_ACKS.some((k) => k.re.test(text)) && text.length >= 12;
        if (isOffTopic) {
          state.offTopicCount += 1;
          const tieback = OFFTOPIC_TIEBACKS[offTopicIdx % OFFTOPIC_TIEBACKS.length];
          offTopicIdx += 1;
          return {
            messages: [{ role: 'tutor', kind: 'hint', text: `${ack} ${tieback(target.label)}\nお手本：「${target.example}」`, zhNote: zh(`试着用 ${target.label} 来说说刚才的话。`, 'grammar') }],
            quickReplies: [{ text: target.example }],
          };
        }
        const template = RECHALLENGE_TEMPLATES[rechallengeIdx % RECHALLENGE_TEMPLATES.length];
        rechallengeIdx += 1;
        return {
          messages: [{ role: 'tutor', kind: 'hint', text: `${ack} ${template(target.label, target.example)}`, zhNote: zh(`${target.zhMeaning}`, 'grammar') }],
          quickReplies: [{ text: target.example }],
        };
      }

      // ⑥ 通常進行: 受け止め＋次の質問（1ターン1質問）
      return nextQuestionTurn(ack);
    },

    hint(): TutorTurn {
      hintButtonUsed = true;
      return supportTurn();
    },

    zhExplain(): TutorTurn {
      state.zhExplainCount += 1;
      const qa = currentQA();
      return {
        messages: [
          {
            role: 'tutor',
            kind: 'hint',
            text: `中文解释：${qa.zh}\n目标句型：${target.zhMeaning}\n例句：${target.example}（${target.zhExample}）`,
          },
        ],
      };
    },

    getState(): Readonly<LessonSessionState> {
      return { ...state };
    },

    getOutcome(): TutorOutcome {
      const expressions: ExpressionRecord[] = [
        { label: target.label, zhMeaning: target.zhMeaning, usage: state.targetUsage ?? 'learned' },
        { label: script.bonus.label, zhMeaning: script.bonus.zhMeaning, usage: 'learned' },
      ];
      return {
        expressions,
        corrections,
        missionAchieved: state.targetUseCount > 0,
      };
    },
  };
};
