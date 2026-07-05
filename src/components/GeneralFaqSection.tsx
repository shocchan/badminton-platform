import { useState } from 'react';
import { FAQSchema, type FaqItem } from './seo/FAQSchema';
import type { Lang } from '../contexts/LanguageContext';

const faqsJa: FaqItem[] = [
  { question: '初心者でも参加できますか？', answer: 'レベル分けをしているので初心者・ブランクありの方も歓迎です。' },
  { question: '一人で参加しても大丈夫ですか？', answer: '参加者の多くがお一人での参加です。交流会形式なのですぐ馴染めます。' },
  { question: 'シャトルは持参が必要ですか？', answer: '会費に含まれています。ラケットと室内シューズのみご持参ください。' },
  { question: '参加費はいくらですか？', answer: '活動により異なります。各イベントページをご確認ください。' },
  { question: '会場はどこですか？', answer: '主に蕨市民体育館・芝園公民館（川口市）で活動しています。' },
  { question: '中国語しか話せなくても参加できますか？', answer: '運営が中国語対応可能です。中日バイリンガルのコミュニティです。' },
  { question: '大会の申し込み方法は？', answer: '各大会ページのエントリーフォームからお申し込みください。' },
  { question: '駐車場はありますか？', answer: '会場ごとに異なります。会場ガイドページをご確認ください。' },
];

const faqsZh: FaqItem[] = [
  { question: '初次参加也可以吗？', answer: '我们设有分级制度，欢迎初学者和有一段时间没打球的朋友参加。' },
  { question: '一个人参加也没问题吗？', answer: '大多数参加者都是一个人来的。交流会形式很容易融入。' },
  { question: '需要自带羽毛球吗？', answer: '已包含在活动费用中，请只需自带球拍和室内运动鞋。' },
  { question: '参加费用是多少？', answer: '因活动而异，请查看各活动页面确认。' },
  { question: '场地在哪里？', answer: '主要在蕨市民体育馆・芝园公民馆（川口市）举办活动。' },
  { question: '只会中文可以参加吗？', answer: '运营团队可以用中文沟通，是中日双语社区。' },
  { question: '大会的报名方法是？', answer: '请通过各大会页面的报名表单进行申请。' },
  { question: '有停车场吗？', answer: '因场地而异，请查看场地指南页面确认。' },
];

interface GeneralFaqSectionProps {
  lang: Lang;
}

export const GeneralFaqSection = ({ lang }: GeneralFaqSectionProps) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const items = lang === 'zh' ? faqsZh : faqsJa;

  return (
    <section className="max-w-6xl mx-auto px-4 pb-10">
      <FAQSchema items={items} />
      <h2 className="text-xl font-extrabold text-gray-900 mb-6 text-center">
        {lang === 'zh' ? '❓ 常见问题' : '❓ よくある質問'}
      </h2>
      <div className="max-w-2xl mx-auto space-y-2">
        {items.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div key={item.question} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              <button
                onClick={() => setOpenIndex(isOpen ? null : index)}
                aria-expanded={isOpen}
                className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-blue-600 font-extrabold text-sm flex-shrink-0 mt-0.5">Q.</span>
                  <span className="font-bold text-gray-800 text-sm sm:text-base">{item.question}</span>
                </div>
                <span className={`flex-shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {isOpen && (
                <div className="px-5 pb-4 pt-0">
                  <div className="border-t border-gray-100 pt-4 flex gap-3">
                    <span className="text-green-600 font-extrabold text-sm flex-shrink-0 mt-0.5">A.</span>
                    <p className="text-sm text-gray-600 leading-relaxed">{item.answer}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
