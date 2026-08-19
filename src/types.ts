// =====================================================
// Filmspot Types
// =====================================================

export interface FilmspotMovie {
  imgUrl?: string;
  originalTitle?: string;
  title?: string;
  url?: string;
  metadata?: string;
  date: Date;
  dateString: string;
}

// =====================================================
// Feed Item Type (from feed library)
// =====================================================

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  content: string;
  date: Date;
  author?: Array<{
    name: string;
    link: string;
  }>;
  image?: string;
}

// =====================================================
// Ante-Estreias RSS Types (xml2js parsed)
// =====================================================

export interface AnteEstreiasRssItem {
  category?: string[];
  description: string[];
  pubDate: string[];
}

export interface AnteEstreiasRssParsed {
  rss: {
    channel: Array<{
      item: AnteEstreiasRssItem[];
    }>;
  };
}
