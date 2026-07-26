// 規則ID→文法図解の対応（§17）。該当があるものだけ図を表示する。
import type { ReactElement } from 'react';
import type { AiCourseDict } from '../../../../locales/aiCourse';
import { NiEDirectionDiagram, DePlaceDiagram, WoObjectDiagram, TeimasuTimelineDiagram, NaiFormDiagram } from './GrammarDiagrams';

export const diagramForRule = (ruleId: string): (({ t }: { t: AiCourseDict }) => ReactElement) | null => {
  switch (ruleId) {
    case 'fr-ni-e-destination': return NiEDirectionDiagram;
    case 'fr-de-place-means': return DePlaceDiagram;
    case 'fr-wo-object': return WoObjectDiagram;
    case 'fr-teimasu': return TeimasuTimelineDiagram;
    case 'fr-nai-form': return NaiFormDiagram;
    case 'fr-ni-place-time': return NiEDirectionDiagram;
    default: return null;
  }
};
