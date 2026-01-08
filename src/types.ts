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
  StartDate?: string;
  string_dates?: string;
  string_times?: string;
  featured_media_large?: string;
  link: string;
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
  uid: number;
  slug: string;
  title: string;
  categories: Array<{ title: string }>;
  startdate?: { date: string };
  enddate?: { date: string };
}

export interface InformacaoLisboaNoticia {
  uid: number;
  url: string;
  titulo: string;
  noticia: string;
  categorias?: Array<{ nome: string }>;
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
    categories?: Array<{ path: string }>;
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
  categories?: Array<{ path: string }>;
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
  datetime_cB1vB7YcXz?: string;
}

export interface ImagensDeMarcaResponse {
  items: ImagensDeMarcaPost[];
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
  refresh_token: string;
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
// UCI Cinemas Types
// =====================================================

export interface UciPromotionImage {
  desktop: string;
  alt?: string;
}

export interface UciPromotion {
  name: string;
  urlSegment: string;
  url: string;
  nodeId: number;
  alias: string;
  createDate: string;
  updateDate: string;
  promotionImage?: UciPromotionImage;
  introText?: string;
  header?: string;
}

export type UciPromocoesResponse = UciPromotion[];

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

// =====================================================
// Discord Quests Types
// =====================================================

export interface DiscordQuestUserStatus {
  user_id: string;
  quest_id: string;
  enrolled_at: string;
  completed_at: string | null;
  claimed_at: string | null;
}

export interface DiscordQuestConfig {
  id: string;
  starts_at: string;
  expires_at: string;
  messages: {
    quest_name: string;
    game_title: string;
    game_publisher: string;
  };
  application: {
    link: string;
    id: string;
    name: string;
  };
  rewards_config: {
    rewards: Array<{
      type: number;
      messages: {
        name: string;
      };
    }>;
  };
}

export interface DiscordQuest {
  id: string;
  config: DiscordQuestConfig;
  user_status: DiscordQuestUserStatus | null;
}

export interface DiscordQuestsResponse {
  quests: DiscordQuest[];
}
