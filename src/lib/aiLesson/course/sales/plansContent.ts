// 料金ページの文言（ja / 簡体字zh）。§5 §6。
//
// 方針:
//   - 迷わせない。見出し → 3プラン → 「買ったら何が起きるか」→ 実際の画面 → よくある質問。
//   - 説明を盛らない。まだ無い実績（口コミ・合格者数・利用者数）は**一切書かない**（§6末尾）。
//   - 不利なこと（人間レッスンが無い・自動更新が無い・キャンセル条件）を先に書く。
//     コールド流入は「隠していないか」を見ているので、そこを先に出したほうが結果的に伝わる。

export interface PlansCopy {
  /** ページタイトル（<title>） */
  documentTitle: string;
  metaDescription: string;

  heroTitle: string;
  heroSubtitle: string;

  /** 「誰向けか」「何ができるか」を先頭で言い切る（§6） */
  whoForHeading: string;
  whoFor: string[];

  compareHeading: string;
  /** 3プランの違いを1行で（人間介入の有無が本質。§2） */
  compareNote: string;

  afterPurchaseHeading: string;
  afterPurchaseLead: string;
  afterPurchaseSteps: { title: string; body: string }[];

  screensHeading: string;
  screensLead: string;
  /** 実装済みの画面だけを並べる（§6「架空の画面や未実装機能を表示しない」） */
  screens: { name: string; body: string }[];

  faqHeading: string;
  faq: { q: string; a: string }[];

  contactHeading: string;
  contactBody: string;
  contactCta: string;

  /** 実績を出せないことを、ごまかさずに書く */
  noTestimonialNote: string;

  planSectionLabel: string;
  limitationsLabel: string;
  featuresLabel: string;
  previewBadge: string;
  pausedBadge: string;
  /** 価格がまだ確定していないときの表示（受付停止とは理由が違うので分ける） */
  priceTbdBadge: string;
}

const JA: PlansCopy = {
  documentTitle: '料金プラン｜AI日本語コース',
  metaDescription:
    '60分だけ試す、1か月続ける、6か月先生と進む。3つの始め方と料金をここで比べられます。AIが現在地を測り、今日必要な学習を決めます。',

  heroTitle: '必要な分だけ、すぐに始められます',
  heroSubtitle:
    '10分だけ学びたい日も、\n1か月続けてみたいときも、\n先生と目標を目指したいときも。\n\n今の目的に合う方法から始められます。',

  whoForHeading: 'このコースは、こういう人のためのものです',
  whoFor: [
    '日本語を勉強しているけれど、今日は何をすればいいのか分からない',
    '教材はたくさん持っているのに、自分に合うものを選べない',
    'N3・N2に向けて、今の自分がどこにいるのかを知りたい',
    '会話でとっさに出てこない表現を、練習で使えるようにしたい',
  ],

  compareHeading: '3つの始め方',
  compareNote:
    '違いは「人が関わるかどうか」です。60分と1か月はAIだけで進みます。6か月コースだけ、先生が記録を見て方針を直します。',

  afterPurchaseHeading: '買ったあと、すぐに起きること',
  afterPurchaseLead: '相談も、面談も、順番待ちもありません。支払いが終わったその画面から始まります。',
  afterPurchaseSteps: [
    { title: '1. 目的を選ぶ', body: '「N2に合格したい」「会話ができるようになりたい」など、目的を1つ選びます。30秒ほどです。' },
    { title: '2. 現在地を測る', body: 'AIが短い問題であなたの今の位置を確かめます。長い試験ではありません。' },
    { title: '3. 今日使う時間を選ぶ', body: '「10分だけ」でも大丈夫です。残りは次回に持ち越せます。' },
    { title: '4. 学習が始まる', body: '1万問以上の問題から、今のあなたに必要な問題をAIが選びます。終わると、できたことが記録に残ります。' },
  ],

  screensHeading: '実際に使う画面',
  screensLead: 'すべて今動いている画面です。ここに書いていない機能はありません。',
  screens: [
    { name: '今日の冒険', body: '今日やることが1つだけ決まっています。何をするか迷う時間がありません。' },
    { name: '問題バトル', body: '4択の問題に答えます。間違えた理由まで日本語と中国語で説明されます。' },
    { name: 'AI会話', body: '先生の声と話します。詰まったときは日本語の字幕の下に中国語が薄く出ます。' },
    { name: '学習レポート', body: 'その日にできるようになったこと、直した表現、次にやることが出ます。' },
    { name: '冒険マップ', body: '今どこまで進んだか、次にどこへ行くかが地図で分かります。' },
    { name: '週のまとめ', body: '1週間の記録から、伸びた力と、まだ判定できない力を分けて出します。' },
  ],

  faqHeading: 'よくある質問',
  faq: [
    { q: '60分は一度に使い切らないといけませんか？', a: 'いいえ。10分ずつ6回でも構いません。ただし購入から7日以内に開始し、開始してから24時間のあいだにお使いください。' },
    { q: 'ブラウザを閉じたら時間は減りますか？', a: '減りません。時間はサーバーで数えていて、学習していない間は進みません。離席したときも自動で止まります。' },
    { q: '人間の先生のレッスンはついていますか？', a: '60分パスと1か月プランには含まれません。先生と進めたい場合は6か月伴走コースです。' },
    { q: '自動で更新されますか？', a: 'されません。60分パスも1か月プランも、期間が終わればそこで終わりです。続けたいときはご自身で選んでいただきます。' },
    { q: '60分を使い切ったら、進捗は消えますか？', a: '消えません。もう一度購入しても、診断からやり直す必要はなく、前回の続きから始められます。' },
    { q: '1か月プランに変えたら、それまでの学習はどうなりますか？', a: 'そのまま引き継がれます。学んだ内容も、復習の予定も、冒険マップも残ります。' },
    { q: '教材をまとめてダウンロードできますか？', a: 'できません。このコースは教材を配るものではなく、今のあなたに必要な学習をAIが選んで進めるものです。' },
    { q: 'キャンセルできますか？', a: '購入から8日以内であれば、お申し出によりキャンセルできます。それ以降は原則として返金はいたしません。詳しくはキャンセルポリシーをご覧ください。' },
    { q: '中国語で表示できますか？', a: 'できます。画面右上の言語ボタンで、いつでも切り替えられます。学習の途中でも切り替えられます。' },
  ],

  contactHeading: '解決しないときは',
  contactBody: '上のよくある質問で解決しない場合は、お問い合わせください。順にお返事します。',
  contactCta: 'お問い合わせ',

  noTestimonialNote:
    'このコースはまだ始まったばかりで、公開できる合格実績や利用者の声はありません。無いものは書かないことにしています。',

  planSectionLabel: '料金プラン',
  limitationsLabel: 'できないこと・注意',
  featuresLabel: '含まれるもの',
  previewBadge: '未公開（プレビュー）',
  pausedBadge: '受付停止中',
  priceTbdBadge: '価格を準備中です',
};

const ZH: PlansCopy = {
  documentTitle: '价格方案｜AI日语课程',
  metaDescription:
    '先用60分钟试试、坚持1个月、或用6个月和老师一起走。三种开始方式和价格可以在这里比较。AI测量你的当前位置，决定今天该学什么。',

  heroTitle: '需要多少，就从多少开始',
  heroSubtitle:
    '只想学10分钟的日子，\n想坚持1个月的时候，\n想和老师一起冲目标的时候。\n\n可以从符合当下目的的方式开始。',

  whoForHeading: '这门课程适合这样的人',
  whoFor: [
    '一直在学日语，但不知道今天该做什么',
    '教材有很多，却选不出适合自己的那一份',
    '想知道自己现在离N3、N2还有多远',
    '想把会话时说不出口的表达，练到能用出来',
  ],

  compareHeading: '三种开始方式',
  compareNote:
    '区别在于「有没有人参与」。60分钟和1个月由AI单独进行。只有6个月课程，老师会看着记录来调整方向。',

  afterPurchaseHeading: '购买之后，马上会发生的事',
  afterPurchaseLead: '不需要咨询，不需要面谈，也不用排队。付款完成后，就从那个页面开始。',
  afterPurchaseSteps: [
    { title: '1. 选择目的', body: '从「想通过N2」「想能开口会话」等选一个目的。大约30秒。' },
    { title: '2. 测量当前位置', body: 'AI用简短的题目确认你现在的位置。不是长时间的考试。' },
    { title: '3. 选择今天要用的时间', body: '「只用10分钟」也没问题。剩下的可以留到下一次。' },
    { title: '4. 学习开始', body: '从1万道以上的题目中，由AI挑选此刻你需要的题目。结束后，做到的事会留在记录里。' },
  ],

  screensHeading: '实际使用的界面',
  screensLead: '以下都是现在已经在运行的界面。没有写在这里的功能，就是没有。',
  screens: [
    { name: '今日冒险', body: '今天要做的事只有一件。不用花时间纠结做什么。' },
    { name: '题目对战', body: '回答四选一的题目。连错的原因也会用日语和中文说明。' },
    { name: 'AI对话', body: '和老师的声音对话。卡住的时候，日语字幕下方会淡淡地显示中文。' },
    { name: '学习报告', body: '会列出当天新学会的事、修正过的表达，以及下次要做的事。' },
    { name: '冒险地图', body: '走到哪里了、接下来去哪里，在地图上一目了然。' },
    { name: '每周总结', body: '从一周的记录中，把提升了的能力和还无法判定的能力分开呈现。' },
  ],

  faqHeading: '常见问题',
  faq: [
    { q: '60分钟必须一次用完吗？', a: '不用。分成6次、每次10分钟也可以。但请在购买后7天内开始，并在开始后的24小时内使用。' },
    { q: '关掉浏览器时间会减少吗？', a: '不会。时间由服务器计算，没有在学习的时候不会走。离开座位时也会自动停止。' },
    { q: '有真人老师的课吗？', a: '60分钟通行证和1个月计划不含真人课程。想和老师一起推进的话，是6个月陪伴课程。' },
    { q: '会自动续费吗？', a: '不会。60分钟通行证和1个月计划，期限结束就结束。想继续时由你自己选择。' },
    { q: '60分钟用完后，学习进度会消失吗？', a: '不会消失。即使再次购买，也不需要重新做测评，可以从上次的地方继续。' },
    { q: '换成1个月计划后，之前的学习会怎样？', a: '会直接继承。学过的内容、复习的安排、冒险地图都会保留。' },
    { q: '可以批量下载教材吗？', a: '不可以。这门课程不是发放教材，而是由AI挑选此刻你需要的学习内容并带着你推进。' },
    { q: '可以取消吗？', a: '购买后8天以内提出即可取消。之后原则上不予退款。详情请见取消政策。' },
    { q: '可以用中文显示吗？', a: '可以。用页面右上角的语言按钮随时切换，学习途中也能切换。' },
  ],

  contactHeading: '如果没有解决',
  contactBody: '上面的常见问题没能解决的话，请联系我们。我们会依次回复。',
  contactCta: '联系我们',

  noTestimonialNote:
    '这门课程刚刚开始，还没有可以公开的合格实绩或学员评价。没有的东西，我们就不写。',

  planSectionLabel: '价格方案',
  limitationsLabel: '不包含的内容与注意事项',
  featuresLabel: '包含的内容',
  previewBadge: '未公开（预览）',
  pausedBadge: '暂停受理',
  priceTbdBadge: '价格筹备中',
};

export const plansCopy = (lang: 'ja' | 'zh'): PlansCopy => (lang === 'zh' ? ZH : JA);

/** 料金ページのURL（1か所で決める） */
export const plansPathFor = (lang: 'ja' | 'zh'): string => `/${lang}/ai-course/plans`;

/** プランごとの購入・相談への入口のURL */
export const purchasePathFor = (lang: 'ja' | 'zh', planId: string): string =>
  `/${lang}/ai-course/plans/${planId}`;

/**
 * §6 が求める「初めて来た人がすぐ分かること」のチェック項目。
 * 画面テストがこの一覧を走査して、抜けを検出する。
 */
export const COLD_TRAFFIC_REQUIREMENTS = [
  'what_it_does',       // 何ができるか
  'who_for',            // 誰向けか
  'price',              // 料金
  'usage_scope',        // どこまで利用できるか
  'human_lesson',       // 人間レッスンの有無
  'auto_renew',         // 自動更新の有無
  'after_purchase',     // 購入後すぐ何が起きるか
  'contact',            // 問い合わせ方法
  'cancel',             // キャンセル条件
] as const;

/** ヘルプ画面への案内文（料金ページ・購入完了から出す） */
export const helpLinkLabel = (lang: 'ja' | 'zh'): string =>
  lang === 'zh' ? '遇到问题时' : '困ったときは';

/**
 * 再購入の人に見せるCTA文言（§11）。
 * 「新しく買い直す」ではなく「足す・続ける」と言う。
 * 進捗が実際に残る設計になっているので、そう言って良い。
 */
export const repurchaseCtaLabel = (
  planId: string,
  lang: 'ja' | 'zh',
  includedActiveMinutes: number | null,
): string | null => {
  if (includedActiveMinutes !== null) {
    return lang === 'zh'
      ? `再增加${includedActiveMinutes}分钟`
      : `${includedActiveMinutes}分を追加する`;
  }
  if (planId === 'ai-month') {
    return lang === 'zh' ? '再续1个月' : 'もう1か月続ける';
  }
  return null;
};

/** 再購入時に添える一言（診断をやり直さないことを、購入前に伝える） */
export const repurchaseNote = (lang: 'ja' | 'zh'): string =>
  lang === 'zh'
    ? '不会创建新账号。可以从上次的地方继续。'
    : '新しいアカウントは作られません。同じ続きから再開できます。';
