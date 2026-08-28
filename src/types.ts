// =====================================================
// Filmspot Types
// =====================================================

export interface FilmspotMovie {
  date: Date;
  dateString: string;
  imgUrl?: string;
  metadata?: string;
  originalTitle?: string;
  title?: string;
  url?: string;
}

// =====================================================
// Feed Item Type (from feed library)
// =====================================================

export interface FeedItem {
  author?: Array<{
    link: string;
    name: string;
  }>;
  content: string;
  date: Date;
  id: string;
  image?: string;
  link: string;
  title: string;
}

// =====================================================
// Ante-Estreias RSS Types (xml2js parsed)
// =====================================================

export interface AnteEstreiasRssItem {
  category?: Array<string>;
  description: Array<string>;
  pubDate: Array<string>;
}

export interface AnteEstreiasRssParsed {
  rss: {
    channel: Array<{
      item: Array<AnteEstreiasRssItem>;
    }>;
  };
}
