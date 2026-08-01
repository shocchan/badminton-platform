// 案内の先生のアバター（丸）。
// もとは翔子先生固定だったが、学習者が先生を選べるようになったため
// **TeacherAvatar へ委譲**する。既存の呼び出し側（AI会話・復習・レポート等）は変更不要のまま、
// 学習者が選んだ先生に自動的に揃う。未選択なら従来どおり翔子先生。
//
// 名前は互換のため ShokoAvatar のままにしてある（実体は選択中の先生）。
import { TeacherAvatar } from './TeacherAvatar';

export type ShokoExpression = 'neutral' | 'speaking' | 'smile';

interface Props {
  size?: number;               // px
  expression?: ShokoExpression;
  className?: string;
  /** 装飾用途で読み上げ不要なら false */
  labeled?: boolean;
  /** alt/aria-label の言語。既定は日本語（従来どおり） */
  lang?: 'ja' | 'zh';
}

export const ShokoAvatar = ({ size = 40, expression = 'neutral', className = '', labeled = true, lang = 'ja' }: Props) => (
  <TeacherAvatar size={size} expression={expression} className={className} labeled={labeled} lang={lang} />
);
