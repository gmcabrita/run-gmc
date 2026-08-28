export interface RSSData {
  description?: string;
  entries: Array<RSSEntry>;
  id: string;
  language: string;
  link: string;
  title: string;
}

export interface RSSEntry {
  datetime?: Date;
  id: string;
  imageURL?: string;
  link: string;
  text?: string;
  title: string;
}
