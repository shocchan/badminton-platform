import { Helmet } from 'react-helmet-async';

export interface BreadcrumbItem {
  label: string;
  /** 絶対URL or サイトルートからの相対パス。最後の要素（現在地）は省略可 */
  path?: string;
}

interface BreadcrumbSchemaProps {
  items: BreadcrumbItem[];
}

const toAbsoluteUrl = (path: string) =>
  path.startsWith('http') ? path : `https://kawabado.com${path}`;

export const BreadcrumbSchema = ({ items }: BreadcrumbSchemaProps) => {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.path && { item: toAbsoluteUrl(item.path) }),
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
};
