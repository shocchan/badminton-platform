// 法務8ページの本文（ja / zh）。
//
// 事実に依存する箇所は必ず LEGAL_FACTS から差し込む。ここに事実を直書きしない。
// 事実が null の段落は、その段落ごと出さない（作文もしないし「準備中」とも書かない）。
//
// この文書は法的助言ではなく、専門家レビューは Public General Release と分離して扱う
// （docs/ai-course/decision-packets/legal-draft-packet-20260730.md）。
import { LEGAL_FACTS, type LegalFacts } from './legalFacts';

export type LegalPageId =
  | 'terms' | 'privacy' | 'ai-disclosure' | 'tokushoho'
  | 'cancel-policy' | 'data-deletion' | 'account-deletion' | 'contact';

/** 法務ページのURL。component側から定数をexportするとFast Refreshが効かないのでここに置く */
export const legalPathFor = (lang: string, id: LegalPageId) => `/${lang}/ai-course/${id}`;

export const LEGAL_PAGE_IDS: LegalPageId[] = [
  'terms', 'privacy', 'ai-disclosure', 'tokushoho',
  'cancel-policy', 'data-deletion', 'account-deletion', 'contact',
];

export interface LegalSection {
  heading: string;
  /** null が混じる段落は描画時に取り除く（＝事実が未確定なら出さない） */
  body: (string | null)[];
  /** この節を出すのに必要な事実。未確定なら節ごと出さない */
  requires?: (keyof LegalFacts)[];
}

export interface LegalPage {
  id: LegalPageId;
  title: string;
  intro: string;
  sections: LegalSection[];
}

const yen = (n: number | null) => (n === null ? null : `${n.toLocaleString('ja-JP')}円（税込）`);

export const buildLegalPages = (lang: 'ja' | 'zh', f: LegalFacts = LEGAL_FACTS): LegalPage[] => {
  const ja = lang === 'ja';
  const t = (a: string, b: string) => (ja ? a : b);

  return [
    {
      id: 'terms',
      title: t('利用規約', '使用条款'),
      intro: t(
        'このコース（以下「本サービス」）をご利用いただく前に、次の内容をご確認ください。',
        '在使用本课程（以下称「本服务」）之前，请先确认以下内容。',
      ),
      sections: [
        {
          heading: t('第1条 適用', '第1条 适用范围'),
          body: [t(
            '本規約は、本サービスの利用に関する条件を定めるものです。受講者は本規約に同意したうえで本サービスを利用するものとします。',
            '本条款规定使用本服务的相关条件。学员在同意本条款后方可使用本服务。',
          )],
        },
        {
          heading: t('第2条 提供内容', '第2条 提供内容'),
          body: [
            t(
              '本サービスは、日本語の会話練習・語彙・文法の学習機能と、講師による伴走を提供します。',
              '本服务提供日语会话练习、词汇、语法的学习功能，以及讲师的陪伴指导。',
            ),
            t(
              '学習の成果には個人差があり、JLPT等の試験合格を保証するものではありません。',
              '学习成果因人而异，本服务不保证通过JLPT等考试。',
            ),
          ],
        },
        {
          heading: t('第3条 受講資格', '第3条 报名资格'),
          requires: ['minimumAge'],
          body: [
            f.minimumAge === null ? null : t(
              `本サービスは${f.minimumAge}歳以上の方を対象とします。`,
              `本服务面向${f.minimumAge}周岁以上的用户。`,
            ),
          ],
        },
        {
          heading: t('第4条 禁止事項', '第4条 禁止事项'),
          body: [t(
            '教材・例文・音声その他の提供物を、権利者の許可なく複製・再配布・販売することを禁止します。また、他の受講者や講師の権利を侵害する行為、本サービスの運営を妨げる行為を禁止します。',
            '未经权利人许可，禁止复制、转发、销售教材、例句、音频及其他提供物。同时禁止侵害其他学员或讲师权利的行为，以及妨碍本服务运营的行为。',
          )],
        },
        {
          heading: t('第5条 知的財産', '第5条 知识产权'),
          body: [t(
            '本サービスで提供する教材の著作権は運営者に帰属します。受講者は自身の学習の範囲でのみ利用できます。',
            '本服务提供的教材著作权归运营者所有。学员仅可在自身学习范围内使用。',
          )],
        },
        {
          heading: t('第6条 免責', '第6条 免责'),
          body: [t(
            '本サービスの一部はAIによって生成されており、誤りを含むことがあります。運営者は、通信環境・外部サービスの障害など運営者の責めに帰さない事由による不利益について責任を負いません。',
            '本服务的部分内容由AI生成，可能包含错误。因通信环境、外部服务故障等不可归责于运营者的事由造成的损失，运营者不承担责任。',
          )],
        },
        {
          heading: t('第7条 準拠法・管轄', '第7条 准据法与管辖'),
          requires: ['governingLaw'],
          body: [f.governingLaw],
        },
      ],
    },

    {
      id: 'privacy',
      title: t('プライバシーポリシー', '隐私政策'),
      intro: t(
        '本サービスが取得する情報と、その使いかたをまとめています。',
        '这里说明本服务收集哪些信息，以及如何使用这些信息。',
      ),
      sections: [
        {
          heading: t('取得する情報', '收集的信息'),
          body: [t(
            'メールアドレス、ニックネーム、学習の進捗、会話の内容（音声およびテキスト）、利用状況の記録を取得します。',
            '我们会收集邮箱地址、昵称、学习进度、会话内容（语音与文字）以及使用记录。',
          )],
        },
        {
          heading: t('利用目的', '使用目的'),
          body: [t(
            '学習機能の提供、進捗の保存と復元、教材と応答の品質改善、不正利用の防止のために利用します。',
            '用于提供学习功能、保存与恢复进度、改进教材与回复质量、防止滥用。',
          )],
        },
        {
          heading: t('外部への送信', '向外部发送'),
          requires: ['externalAiVendors'],
          body: [
            f.externalAiVendors === null ? null : t(
              `会話の音声およびテキストは、応答を生成するために次の外部事業者へ送信されます：${f.externalAiVendors.join('、')}。`,
              `为了生成回复，会话的语音和文字会发送给以下外部服务商：${f.externalAiVendors.join('、')}。`,
            ),
          ],
        },
        {
          heading: t('保管', '保存位置'),
          body: [t(
            `情報は${f.dataHosting}に保管されます。`,
            '信息保存在Supabase（PostgreSQL）以及浏览器的本地存储中。',
          )],
        },
        {
          heading: t('保存期間', '保存期限'),
          requires: ['retentionPeriod'],
          body: [f.retentionPeriod],
        },
        {
          heading: t('学習内容の改善への利用', '用于改进学习内容'),
          requires: ['improvementUseAllowed'],
          body: [
            f.improvementUseAllowed === null ? null : (f.improvementUseAllowed
              ? t('個人を特定できない形に加工したうえで、教材と応答の改善に利用することがあります。',
                '在加工为无法识别个人的形式后，可能用于改进教材与回复。')
              : t('受講者の発話・作文を教材の改善に利用することはありません。',
                '不会将学员的发言和作文用于改进教材。')),
          ],
        },
        {
          heading: t('計測', '统计分析'),
          body: [t(
            '利用状況の把握のためにアクセス解析を利用します。個人を特定する目的では利用しません。',
            '为了解使用情况会使用访问分析。不会用于识别个人身份。',
          )],
        },
        {
          heading: t('第三者提供', '向第三方提供'),
          body: [t(
            '法令に基づく場合を除き、本人の同意なく第三者へ提供することはありません。',
            '除法律法规要求外，未经本人同意不会向第三方提供。',
          )],
        },
        {
          heading: t('開示・削除の請求', '查询与删除请求'),
          body: [t(
            `保有する情報の開示・訂正・削除を希望される場合は ${f.contactEmail} へご連絡ください。`,
            `如需查询、更正或删除我们保存的信息，请联系 ${f.contactEmail}。`,
          )],
        },
      ],
    },

    {
      id: 'ai-disclosure',
      title: t('AIの利用について', '关于AI的使用'),
      intro: t(
        '本サービスでAIをどのように使っているかを説明します。会話を始める前にお読みください。',
        '这里说明本服务如何使用AI。请在开始会话前阅读。',
      ),
      sections: [
        {
          heading: t('どこでAIを使っているか', '在哪些地方使用AI'),
          body: [t(
            '会話練習の相手役、会話後のレポート、教材の下書き作成にAIを使っています。教材の下書きは講師の確認を順次進めています。',
            '会话练习的对话方、会话后的报告、教材的草稿都使用了AI。教材草稿正在由讲师逐步确认。',
          )],
        },
        {
          heading: t('AIの回答には誤りが含まれます', 'AI的回答可能包含错误'),
          body: [t(
            'AIは自然な日本語を返すことを目指しますが、事実の誤り・不自然な表現・不適切な訂正が含まれることがあります。重要な判断はAIの回答だけに頼らず、講師にご確認ください。',
            'AI力求给出自然的日语，但仍可能出现事实错误、不自然的表达或不恰当的纠正。重要判断请不要只依赖AI的回答，请向讲师确认。',
          )],
        },
        {
          heading: t('会話の内容は保存されます', '会话内容会被保存'),
          body: [t(
            '学習の記録と復習のため、会話の音声とテキストを保存します。保存された内容の削除を希望される場合は、データ削除のページをご覧ください。',
            '为了记录学习和复习，我们会保存会话的语音和文字。如希望删除已保存的内容，请查看数据删除页面。',
          )],
        },
        {
          heading: t('外部の事業者へ送信されます', '会发送给外部服务商'),
          requires: ['externalAiVendors'],
          body: [
            f.externalAiVendors === null ? null : t(
              `応答を生成するため、会話の内容は ${f.externalAiVendors.join('、')} へ送信されます。`,
              `为了生成回复，会话内容会发送给 ${f.externalAiVendors.join('、')}。`,
            ),
          ],
        },
        {
          heading: t('AIを使わない選択', '不使用AI的选择'),
          body: [t(
            'AIとの会話を使わずに、語彙・文法・読解の学習だけを進めることもできます。',
            '你也可以不使用AI会话，只进行词汇、语法、阅读的学习。',
          )],
        },
      ],
    },

    {
      id: 'tokushoho',
      title: t('特定商取引法に基づく表記', '基于特定商业交易法的标示'),
      intro: t(
        '有料コースのお申し込みにあたっての表示事項です。',
        '这是报名付费课程时的必要标示事项。',
      ),
      sections: [
        {
          heading: t('販売事業者', '销售经营者'),
          requires: ['operatorName'],
          body: [f.operatorName],
        },
        {
          heading: t('所在地', '所在地'),
          requires: ['address'],
          body: [
            f.address === null ? null
              : f.address === 'on_request'
                ? t('請求があった場合は遅滞なく開示します。', '如有要求，将不迟延地予以公开。')
                : f.address,
          ],
        },
        {
          heading: t('連絡先', '联系方式'),
          requires: ['phone'],
          body: [
            f.phone === null ? null
              : f.phone === 'on_request'
                ? t(`電話番号は請求があった場合に遅滞なく開示します。メールは ${f.contactEmail} です。`,
                  `电话号码如有要求将不迟延地予以公开。邮箱为 ${f.contactEmail}。`)
                : f.phone,
          ],
        },
        {
          heading: t('販売価格', '销售价格'),
          requires: ['priceJpyTaxIncluded'],
          body: [yen(f.priceJpyTaxIncluded)],
        },
        {
          heading: t('代金以外の必要料金', '价款以外的必要费用'),
          body: [t(
            'インターネット接続にかかる通信料は受講者のご負担となります。',
            '连接互联网所产生的通信费用由学员自行承担。',
          )],
        },
        {
          heading: t('支払方法', '支付方式'),
          requires: ['paymentMethods'],
          body: [f.paymentMethods === null ? null : f.paymentMethods.join('、')],
        },
        {
          heading: t('支払時期', '支付时间'),
          requires: ['paymentTiming'],
          body: [f.paymentTiming],
        },
        {
          heading: t('役務の提供時期', '服务提供时间'),
          requires: ['serviceStartTiming'],
          body: [f.serviceStartTiming],
        },
        {
          heading: t('返品・キャンセル', '退款与取消'),
          requires: ['refundPolicy'],
          body: [f.refundPolicy],
        },
      ],
    },

    {
      id: 'cancel-policy',
      title: t('キャンセル・返金について', '关于取消与退款'),
      intro: t(
        'お申し込み後のキャンセルと返金の取り扱いです。',
        '这里说明报名后取消和退款的处理方式。',
      ),
      sections: [
        {
          heading: t('方針', '方针'),
          requires: ['refundPolicy'],
          body: [f.refundPolicy],
        },
        {
          heading: t('手続き', '办理方式'),
          body: [t(
            `キャンセルをご希望の場合は ${f.contactEmail} へご連絡ください。`,
            `如需取消，请联系 ${f.contactEmail}。`,
          )],
        },
      ],
    },

    {
      id: 'data-deletion',
      title: t('学習データの削除', '学习数据的删除'),
      intro: t(
        '保存されている学習データの削除をご希望の場合の手順です。',
        '这里说明如何删除已保存的学习数据。',
      ),
      sections: [
        {
          heading: t('削除できるもの', '可删除的内容'),
          body: [t(
            '会話の音声とテキスト、学習の進捗、レポートを削除できます。',
            '可以删除会话的语音和文字、学习进度以及报告。',
          )],
        },
        {
          heading: t('手順', '步骤'),
          body: [t(
            `件名を「学習データの削除」として ${f.contactEmail} へご連絡ください。ご登録のメールアドレスから送信してください。`,
            `请以「删除学习数据」为主题联系 ${f.contactEmail}。请使用注册时的邮箱地址发送。`,
          )],
        },
        {
          heading: t('対応の期限', '处理期限'),
          requires: ['deletionSlaDays'],
          body: [
            f.deletionSlaDays === null ? null : t(
              `ご連絡から${f.deletionSlaDays}日以内に削除します。`,
              `将在收到联系后的${f.deletionSlaDays}天内完成删除。`,
            ),
          ],
        },
        {
          heading: t('この端末に残るデータ', '本设备上残留的数据'),
          body: [t(
            '一部の学習状態はご利用の端末内にも保存されています。設定画面から消すことができます。',
            '部分学习状态也保存在你使用的设备中，可以在设置页面清除。',
          )],
        },
      ],
    },

    {
      id: 'account-deletion',
      title: t('アカウントの削除', '删除账号'),
      intro: t(
        '受講をやめる場合のアカウント削除についてです。',
        '这里说明停止学习时如何删除账号。',
      ),
      sections: [
        {
          heading: t('削除されるもの', '会被删除的内容'),
          body: [t(
            'アカウントを削除すると、ログイン情報と学習データがすべて削除され、元に戻すことはできません。',
            '删除账号后，登录信息与学习数据将全部删除，且无法恢复。',
          )],
        },
        {
          heading: t('手順', '步骤'),
          body: [t(
            `件名を「アカウントの削除」として ${f.contactEmail} へご連絡ください。ご登録のメールアドレスから送信してください。`,
            `请以「删除账号」为主题联系 ${f.contactEmail}。请使用注册时的邮箱地址发送。`,
          )],
        },
        {
          heading: t('対応の期限', '处理期限'),
          requires: ['deletionSlaDays'],
          body: [
            f.deletionSlaDays === null ? null : t(
              `ご連絡から${f.deletionSlaDays}日以内に削除します。`,
              `将在收到联系后的${f.deletionSlaDays}天内完成删除。`,
            ),
          ],
        },
      ],
    },

    {
      id: 'contact',
      title: t('お問い合わせ', '联系我们'),
      intro: t(
        'ご質問・ご相談・不具合のご報告はこちらへお願いします。',
        '有疑问、咨询或需要报告问题，请通过以下方式联系我们。',
      ),
      sections: [
        {
          heading: t('連絡先', '联系方式'),
          body: [f.contactEmail],
        },
        {
          heading: t('アプリからの報告', '通过应用内报告'),
          body: [t(
            '学習画面の「こまったとき」からも、うまくいかない点をお知らせいただけます。',
            '你也可以在学习页面的「遇到问题时」中告诉我们哪里不顺利。',
          )],
        },
        {
          heading: t('返信について', '关于回复'),
          body: [t(
            '内容を確認のうえ、順次ご返信します。',
            '我们会在确认内容后依次回复。',
          )],
        },
      ],
    },
  ];
};

/** 事実が欠けている節を取り除いたページを返す（＝作文も「準備中」もしない） */
export const renderableLegalPage = (page: LegalPage, f: LegalFacts = LEGAL_FACTS): LegalPage => ({
  ...page,
  sections: page.sections
    .filter((s) => !s.requires || s.requires.every((k) => f[k] !== null))
    .map((s) => ({ ...s, body: s.body.filter((b): b is string => !!b) }))
    .filter((s) => s.body.length > 0),
});
