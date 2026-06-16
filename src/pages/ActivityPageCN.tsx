import { ActivityPage } from './ActivityPage';

export const ActivityPageCN = ({ groupSlug = 'kawaguchi-warabi' }: { groupSlug?: string }) =>
  <ActivityPage lang="zh" groupSlug={groupSlug} />;

export default ActivityPageCN;
