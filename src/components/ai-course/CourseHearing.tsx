// 初回診断（コース用・8問のタップ選択）。回答から初期の生徒設定を作る。

import { useState } from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import type { DiagnosisAnswers } from '../../lib/aiLesson/course/courseDiagnosis';
import type { AiCourseDict } from '../../locales/aiCourse';

interface Props {
  t: AiCourseDict;
  onComplete: (answers: DiagnosisAnswers, displayName: string) => void;
  busy?: boolean;
}

// 文言はここに閉じる（診断は一度きりのため i18n 辞書を肥大化させない）
const TXT = {
  ja: {
    title: 'はじめまして！いくつか教えてください',
    sub: '8つの質問であなた専用のコースを準備します（約1分）',
    name: 'お名前（ニックネーム可）', namePh: '例：アンディ',
    q: (i: number) => `質問 ${i} / 8`, next: '次へ', back: '戻る', finish: 'コースを始める',
    qs: [
      { k: 'goal', label: '主な目標は？', opts: [['daily', '日常会話を伸ばす'], ['exchange', '日本人と自然に交流'], ['n3', 'JLPT N3'], ['n2', 'JLPT N2'], ['n1', 'JLPT N1'], ['work', '仕事で使う']] },
      { k: 'level', label: '今のレベルは？', opts: [['belowN4', 'N4未満'], ['n4', 'N4'], ['n3', 'N3'], ['n2', 'N2'], ['n1', 'N1'], ['unknown', '分からない']] },
      { k: 'residence', label: '日本での生活は？', opts: [['lt1y', '1年未満'], ['1to3y', '1〜3年'], ['3to5y', '3〜5年'], ['gt5y', '5年以上']] },
      { k: 'scene', label: 'よく使う場面は？', opts: [['daily', '日常生活'], ['work', '仕事'], ['interview', '面接・発表'], ['friends', '友人との交流']] },
      { k: 'struggle', label: '一番の悩みは？', opts: [['recall', '言葉がすぐ出ない'], ['grammar', '文法を間違える'], ['vocab', '語彙が少ない'], ['listening', '聞き取れない'], ['nervous', '緊張して話せない'], ['explain', '長く説明できない']] },
      { k: 'zhSupport', label: '中国語のサポートは？', opts: [['whenStuck', '困った時だけ'], ['grammar', '文法説明の時'], ['often', '多めに'], ['none', '日本語のみ']] },
      { k: 'correction', label: '間違いの直し方は？', opts: [['summary', '最後にまとめて'], ['important', '重要なものだけ'], ['immediate', 'その場で細かく']] },
      { k: 'weeklyTarget', label: '週に何回できそう？', opts: [['3', '週3回'], ['5', '週5回'], ['7', '毎日']] },
    ],
  },
  zh: {
    title: '初次见面！请告诉我一些信息',
    sub: '通过8个问题为你准备专属课程（约1分钟）',
    name: '你的名字（昵称也可以）', namePh: '例：Andy',
    q: (i: number) => `问题 ${i} / 8`, next: '下一步', back: '返回', finish: '开始课程',
    qs: [
      { k: 'goal', label: '主要目标是？', opts: [['daily', '提升日常会话'], ['exchange', '与日本人自然交流'], ['n3', 'JLPT N3'], ['n2', 'JLPT N2'], ['n1', 'JLPT N1'], ['work', '工作中使用']] },
      { k: 'level', label: '目前的水平？', opts: [['belowN4', 'N4以下'], ['n4', 'N4'], ['n3', 'N3'], ['n2', 'N2'], ['n1', 'N1'], ['unknown', '不清楚']] },
      { k: 'residence', label: '在日本生活多久？', opts: [['lt1y', '不到1年'], ['1to3y', '1〜3年'], ['3to5y', '3〜5年'], ['gt5y', '5年以上']] },
      { k: 'scene', label: '常用的场合？', opts: [['daily', '日常生活'], ['work', '工作'], ['interview', '面试・发表'], ['friends', '朋友交流']] },
      { k: 'struggle', label: '最大的困扰？', opts: [['recall', '话说不出来'], ['grammar', '语法出错'], ['vocab', '词汇量少'], ['listening', '听不懂'], ['nervous', '紧张说不出'], ['explain', '无法长说明']] },
      { k: 'zhSupport', label: '中文辅助？', opts: [['whenStuck', '只在卡住时'], ['grammar', '讲语法时'], ['often', '多用一些'], ['none', '只用日语']] },
      { k: 'correction', label: '如何纠正错误？', opts: [['summary', '最后统一'], ['important', '只纠正重要的'], ['immediate', '当场细纠']] },
      { k: 'weeklyTarget', label: '每周能学几次？', opts: [['3', '每周3次'], ['5', '每周5次'], ['7', '每天']] },
    ],
  },
};

export const CourseHearing = ({ t, onComplete, busy }: Props) => {
  const tx = TXT[t.locale];
  const [i, setI] = useState(-1); // -1 = 名前入力
  const [name, setName] = useState('');
  const [ans, setAns] = useState<Record<string, string>>({});

  const pick = (key: string, val: string) => {
    setAns((prev) => ({ ...prev, [key]: val }));
    if (i < tx.qs.length - 1) setI(i + 1);
    else {
      const a = { ...ans, [key]: val };
      onComplete({
        goal: a.goal as DiagnosisAnswers['goal'],
        level: a.level as DiagnosisAnswers['level'],
        residence: a.residence as DiagnosisAnswers['residence'],
        scene: a.scene as DiagnosisAnswers['scene'],
        struggle: a.struggle as DiagnosisAnswers['struggle'],
        zhSupport: a.zhSupport as DiagnosisAnswers['zhSupport'],
        correction: a.correction as DiagnosisAnswers['correction'],
        weeklyTarget: Number(a.weeklyTarget ?? 5),
        jlptGoal: (a.goal === 'n2' ? 'n2' : a.goal === 'n1' ? 'n1' : a.goal === 'n3' ? 'n3' : 'none'),
        examDateISO: null,
        badminton: a.scene === 'badminton',
      }, name.trim());
    }
  };

  return (
    <div className="max-w-md lg:max-w-xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-gray-900">{tx.title}</h1>
        <p className="text-sm text-gray-500 mt-1">{tx.sub}</p>
      </div>

      {i === -1 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <label className="text-sm font-medium text-gray-700 mb-2 block">{tx.name}</label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={tx.namePh}
            className="w-full min-h-11 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          />
          <button type="button" onClick={() => setI(0)} disabled={!name.trim()}
            className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2">
            {tx.next}<ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs text-gray-400 mb-1">{tx.q(i + 1)}</p>
          <p className="font-bold text-gray-900 mb-4">{tx.qs[i].label}</p>
          <div className="space-y-2">
            {tx.qs[i].opts.map(([val, label]) => (
              <button key={val} type="button" disabled={busy} onClick={() => pick(tx.qs[i].k, val)}
                className="w-full min-h-11 px-4 py-3 text-left border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm text-gray-800 disabled:opacity-50">
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setI(i - 1)} disabled={busy}
            className="mt-4 min-h-11 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />{tx.back}
          </button>
        </div>
      )}
    </div>
  );
};
