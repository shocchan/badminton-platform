// 「いま案内している先生」を画面ツリー全体で共有する。
// Home・今日の冒険・AI会話・学習レポート・言い直し・復習・先生レッスン準備で同じ先生になる。
// Provider の外でも既定の先生へ落ちるので、どこで使っても表示が空にならない。
import { createContext, useContext } from 'react';
import { resolveTeacher, type AdvTeacherId, type AdvTeacherDef } from '../../lib/aiLesson/course/adventure/advTeacher';

export const TeacherContext = createContext<AdvTeacherId | null>(null);

/** 現在の先生の定義（未選択・Provider外は既定の先生） */
export const useTeacher = (): AdvTeacherDef => resolveTeacher(useContext(TeacherContext));
