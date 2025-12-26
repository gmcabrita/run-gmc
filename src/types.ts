// =====================================================
// AgendaLX Types
// =====================================================

export interface AgendaLxEvent {
  id: string;
  title?: { rendered?: string };
  subtitle?: string[];
  description?: string[];
  venue?: Record<string, { name?: string }>;
  categories_name_list?: Record<string, { name: string }>;
  tags_name_list?: Record<string, { name: string }>;
  occurences?: string[];
  StartDate?: string;
  string_dates?: string;
  string_times?: string;
  featured_media_large?: string;
  link?: string;
}

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
// LBB Online Types
// =====================================================

export interface LbbOnlinePost {
  id: string;
  title: string;
  slug: string;
  description: string;
  image?: string;
  date: string;
}

export interface LbbOnlineResponse {
  hits: LbbOnlinePost[];
}

// =====================================================
// Informacao Lisboa Types
// =====================================================

export interface InformacaoLisboaAgendaItem {
  uid: string;
  slug: string;
  title: string;
  categories: Array<{ title: string }>;
  startdate?: { date: string };
  enddate?: { date: string };
}

export interface InformacaoLisboaNoticia {
  uid: string;
  url: string;
  titulo: string;
  noticia: string;
  categorias: Array<{ nome: string }>;
  data: string;
  hora: string;
}

export interface InformacaoLisboaNoticiasResponse {
  registos: InformacaoLisboaNoticia[];
}

// =====================================================
// Prime Gaming Types
// =====================================================

export interface PrimeGamingGame {
  assets: {
    id: string;
    title: string;
    externalClaimLink: string;
  };
  offers: Array<{
    startTime: string;
  }>;
}

export interface PrimeGamingResponse {
  data: {
    games: {
      items: PrimeGamingGame[];
    };
  };
}

// =====================================================
// Epic Games Types
// =====================================================

export interface EpicMobileGamePurchase {
  purchaseType: string;
  price: {
    decimalPrice: number;
  };
}

export interface EpicMobileGameOffer {
  content: {
    title: string;
    catalogItemId: string;
    mapping: {
      slug: string;
    };
    purchase?: EpicMobileGamePurchase[];
  };
}

export interface EpicMobileDiscoverItem {
  type: string;
  offers: EpicMobileGameOffer[];
}

export interface EpicMobileDiscoverResponse {
  data: EpicMobileDiscoverItem[];
}

export interface EpicDesktopPromotionalOffer {
  startDate: string;
  endDate: string;
  discountSetting: {
    discountPercentage: number;
  };
}

export interface EpicDesktopPromotionalOffers {
  promotionalOffers: EpicDesktopPromotionalOffer[];
}

export interface EpicDesktopCatalogMapping {
  pageType: string;
  pageSlug: string;
}

export interface EpicDesktopGameElement {
  id: string;
  title: string;
  productSlug?: string;
  catalogNs?: {
    mappings?: EpicDesktopCatalogMapping[];
    offerMappings?: EpicDesktopCatalogMapping[];
  };
  promotions?: {
    promotionalOffers: EpicDesktopPromotionalOffers[];
  };
}

export interface EpicDesktopFreeGamesResponse {
  data: {
    Catalog: {
      searchStore: {
        elements: EpicDesktopGameElement[];
      };
    };
  };
}

// =====================================================
// ScyllaDB Types
// =====================================================

export interface ScyllaDbEventsResponse {
  past: string;
  upcoming: string;
}

// =====================================================
// Imagens de Marca Types
// =====================================================

export interface ImagensDeMarcaPost {
  id: string;
  _title: { all: string };
  _slug: { all: string };
  image_cHyPyUtO1f?: { all: string };
  image_cSyfYQnEab?: { all: string };
  image_crJeRfSWfz?: { all: string };
  datetime_cB1vB7YcXz: string;
}

export interface ImagensDeMarcaResponse {
  items: ImagensDeMarcaPost[];
}

// =====================================================
// XPath RSS Post Types
// =====================================================

export interface XPathRssPost {
  id: string;
  title: string;
  link: string;
  content: string;
  date: Date;
}

// =====================================================
// X/Twitter Types
// =====================================================

export interface XUserLegacy {
  screen_name: string;
  name: string;
  description?: string;
  profile_image_url_https?: string;
}

export interface XUserResult {
  rest_id: string;
  legacy: XUserLegacy;
}

export interface XUserByScreenNameResponse {
  data: {
    user: {
      result: XUserResult;
    };
  };
}

export interface XPostLegacy {
  id_str: string;
  full_text: string;
  created_at: string;
}

export interface XPostCore {
  user_results: {
    result: {
      legacy: XUserLegacy;
    };
  };
}

export interface XPost {
  legacy?: XPostLegacy;
  core?: XPostCore;
}

export interface XTweetResult {
  result?: XPost;
}

export interface XTimelineEntry {
  content?: {
    itemContent?: {
      tweet_results?: XTweetResult;
      promotedMetadata?: unknown;
    };
    items?: Array<{
      item?: {
        itemContent?: {
          tweet_results?: XTweetResult;
          promotedMetadata?: unknown;
        };
      };
    }>;
  };
}

export interface XTimelineInstruction {
  entries?: XTimelineEntry[];
}

export interface XUserTweetsResponse {
  data: {
    user: {
      result: {
        timeline_v2: {
          timeline: {
            instructions: XTimelineInstruction[];
          };
        };
      };
    };
  };
}

export interface XOEmbedResponse {
  html: string;
}

// =====================================================
// Coverflex Types
// =====================================================

export interface CoverflexAuthResponse {
  token: string;
}

export interface CoverflexFile {
  slug: string;
  name: string;
  url: string;
}

export interface CoverflexProduct {
  slug: string;
  files: CoverflexFile[];
}

export interface CoverflexBenefit {
  slug: string;
  products: CoverflexProduct[];
}

export interface CoverflexTechnologyResponse {
  benefit: CoverflexBenefit;
}

export interface CoverflexPocket {
  type: string;
  balance: {
    amount: number;
  };
}

export interface CoverflexPocketsResponse {
  pockets: CoverflexPocket[];
}

// =====================================================
// Fertagus Types
// =====================================================

export interface FertagusTrain {
  ComboioPassou: boolean;
  NomeEstacaoDestino: string;
  DataHoraPartidaChegada_ToOrderBy: string;
  Observacoes?: string;
}

export interface FertagusResponse {
  response: Array<{
    NodesComboioTabelsPartidasChegadas: FertagusTrain[];
  }>;
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
