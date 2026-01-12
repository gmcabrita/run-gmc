export interface RSSData {
  id: string;
  title: string;
  description?: string;
  link: string;
  language: string;
  entries: Array<RSSEntry>;
}

export interface RSSEntry {
  id: string;
  link: string;
  title: string;
  text?: string;
  datetime?: Date;
  imageURL?: string;
  extra?: Record<string, unknown>;
}
