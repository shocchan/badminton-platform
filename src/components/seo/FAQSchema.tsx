import { Helmet } from 'react-helmet-async';

export interface FaqItem {
  question: string;
  answer: string;
}

interface FAQSchemaProps {
  items: FaqItem[];
}

export const FAQSchema = ({ items }: FAQSchemaProps) => {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
};
