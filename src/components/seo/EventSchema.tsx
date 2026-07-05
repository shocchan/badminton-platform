import { Helmet } from 'react-helmet-async';
import type { Tournament } from '../../types';

export type EventStatus = 'EventScheduled' | 'EventCancelled' | 'EventPostponed' | 'EventRescheduled';
export type EventAttendanceMode = 'OfflineEventAttendanceMode' | 'OnlineEventAttendanceMode' | 'MixedEventAttendanceMode';
export type OfferAvailability = 'InStock' | 'SoldOut' | 'LimitedAvailability' | 'PreOrder';

export interface EventSchemaLocation {
  name: string;
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  addressCountry?: string;
}

export interface EventSchemaOffer {
  price: number | string;
  priceCurrency?: string;
  availability?: OfferAvailability;
  url: string;
}

export interface EventSchemaProps {
  name: string;
  /** ISO 8601 の日付 or 日時（例: '2026-07-01' または '2026-07-01T19:00:00+09:00'） */
  startDate: string;
  endDate: string;
  eventStatus?: EventStatus;
  eventAttendanceMode?: EventAttendanceMode;
  location: EventSchemaLocation;
  organizer?: { name: string; url?: string };
  offers?: EventSchemaOffer;
  image?: string | string[];
  description?: string;
}

const DEFAULT_ORGANIZER = { name: '川口・蕨バドミントン交流会（kawabado）', url: 'https://kawabado.com' };

export const EventSchema = ({
  name,
  startDate,
  endDate,
  eventStatus = 'EventScheduled',
  eventAttendanceMode = 'OfflineEventAttendanceMode',
  location,
  organizer = DEFAULT_ORGANIZER,
  offers,
  image,
  description,
}: EventSchemaProps) => {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name,
    startDate,
    endDate,
    eventStatus: `https://schema.org/${eventStatus}`,
    eventAttendanceMode: `https://schema.org/${eventAttendanceMode}`,
    location: {
      '@type': 'Place',
      name: location.name,
      address: {
        '@type': 'PostalAddress',
        streetAddress: location.streetAddress,
        addressLocality: location.addressLocality,
        addressRegion: location.addressRegion ?? '埼玉県',
        addressCountry: location.addressCountry ?? 'JP',
      },
    },
    organizer: {
      '@type': 'Organization',
      name: organizer.name,
      url: organizer.url,
    },
    // 大会参加者は不特定多数のため、主催コミュニティを performer として記載
    // （Google推奨フィールド。欠落すると「重大ではない問題」警告が出る）
    performer: {
      '@type': 'PerformingGroup',
      name: organizer.name,
    },
    ...(offers && {
      offers: {
        '@type': 'Offer',
        price: offers.price,
        priceCurrency: offers.priceCurrency ?? 'JPY',
        availability: `https://schema.org/${offers.availability ?? 'InStock'}`,
        url: offers.url,
      },
    }),
    ...(image && { image: Array.isArray(image) ? image : [image] }),
    ...(description && { description }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
};

/** description に含まれがちなHTMLタグを除去し、JSON-LD用のプレーンテキストにする */
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

/** tournaments テーブルの1行から EventSchema の props を組み立てる */
export function tournamentToEventSchemaProps(
  tournament: Tournament,
  opts: { entryUrl: string; image?: string; availability?: OfferAvailability }
): EventSchemaProps {
  return {
    name: tournament.title,
    startDate: `${tournament.event_date.slice(0, 10)}T${tournament.start_time}+09:00`,
    endDate: `${tournament.event_date.slice(0, 10)}T${tournament.end_time}+09:00`,
    eventStatus: tournament.status === 'cancelled' ? 'EventCancelled' : 'EventScheduled',
    eventAttendanceMode: 'OfflineEventAttendanceMode',
    location: {
      name: tournament.location,
      streetAddress: tournament.venue_address ?? undefined,
      addressRegion: '埼玉県',
      addressCountry: 'JP',
    },
    offers: {
      price: tournament.entry_fee,
      priceCurrency: 'JPY',
      availability: opts.availability,
      url: opts.entryUrl,
    },
    image: opts.image,
    description: tournament.description ? stripHtml(tournament.description) : undefined,
  };
}
