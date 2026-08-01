// 案内の先生のアバター（丸）。teacherId で管理し、性別では分岐しない。
//
// 安全側の設計:
// - asset が無い／読み込みに失敗した場合はモノグラムへ落とす（**空表示にしない**）
// - 表情の画像が用意されていない先生は neutral へ落とす（無い絵をでっち上げない）
// - 選択されていない learner は既定の先生（従来と同じ表示）
import { useState, type ReactNode } from 'react';
import {
  teacherAsset, teacherName,
  type AdvTeacherId, type AdvTeacherDef, type TeacherExpression,
} from '../../lib/aiLesson/course/adventure/advTeacher';
import { TeacherContext, useTeacher } from './teacherContext';

export const TeacherProvider = ({ teacherId, children }: { teacherId: AdvTeacherId | null; children: ReactNode }) => (
  <TeacherContext.Provider value={teacherId}>{children}</TeacherContext.Provider>
);

export interface TeacherAvatarProps {
  size?: number;
  expression?: TeacherExpression;
  className?: string;
  /** 装飾用途で読み上げ不要なら false */
  labeled?: boolean;
  lang?: 'ja' | 'zh';
  /** 明示的に先生を指定したいとき（選択画面のカードなど） */
  teacher?: AdvTeacherDef;
}

export const TeacherAvatar = ({
  size = 40, expression = 'neutral', className = '', labeled = true, lang = 'ja', teacher,
}: TeacherAvatarProps) => {
  const ctx = useTeacher();
  const t = teacher ?? ctx;
  const [failed, setFailed] = useState(false);
  const label = labeled ? teacherName(t, lang) : '';
  const box = { width: size, height: size };

  // fallback: 画像が無い／壊れている場合でも先生が誰かは分かるようにする
  if (failed) {
    return (
      <span
        role={labeled ? 'img' : undefined}
        aria-label={labeled ? label : undefined}
        aria-hidden={labeled ? undefined : true}
        className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-gray-700 ${t.accentClass} ${className}`}
        style={{ ...box, fontSize: Math.max(11, Math.round(size * 0.42)) }}
      >
        {t.monogram}
      </span>
    );
  }

  return (
    <img
      key={`${t.id}:${expression}`}
      src={teacherAsset(t, expression)}
      width={size}
      height={size}
      alt={label}
      aria-hidden={labeled ? undefined : true}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`rounded-full object-cover ${t.accentClass} ${className}`}
      style={{ ...box, objectPosition: 'center 12%' }}
    />
  );
};

export default TeacherAvatar;
