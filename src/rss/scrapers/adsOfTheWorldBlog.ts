import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

interface CampaignEntry extends RSSEntry {
  agency?: string;
  brand?: string;
  campaign?: string;
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<CampaignEntry> = [];
  const rewriter = new HTMLRewriter()
    .on("[id^='campaign_card_']", {
      element() {
        entries.push({
          agency: "",
          brand: "",
          campaign: "",
          id: "",
          link: "",
          text: "",
          title: "",
        });
      },
    })
    .on("[id^='campaign_card_'] .karlasemibold a", {
      element(el) {
        const lastEntry = entries.at(-1);
        const href = el.getAttribute("href");
        if (lastEntry && href) {
          const link = new URL(href, "https://www.adsoftheworld.com").href;
          lastEntry.id = link;
          lastEntry.link = link;
        }
      },
    })
    .on("[id^='campaign_card_'] .karlasemibold a p", {
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry && text.text) {
          lastEntry.campaign = (lastEntry.campaign || "") + text.text;
        }
      },
    })
    .on("[id^='campaign_card_'] .px-4 > .text-sm:first-child a", {
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry && text.text) {
          lastEntry.brand = (lastEntry.brand || "") + text.text;
        }
      },
    })
    .on("[id^='campaign_card_'] .px-4 > .text-sm.mt-4 a", {
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry && text.text) {
          lastEntry.agency = (lastEntry.agency || "") + text.text;
        }
      },
    })
    .on("[id^='campaign_card_'] picture img", {
      element(el) {
        const lastEntry = entries.at(-1);
        const src = el.getAttribute("src");
        if (lastEntry && src) {
          lastEntry.imageURL = src;
        }
      },
    });

  await consume(rewriter.transform(response).body!);
  return {
    description: "Highlighted Campaigns – Ads of the World",
    entries: entries
      .map((entry) => {
        const parts = [entry.brand, entry.campaign, entry.agency].filter(
          (p) => p && p.trim()
        );
        const title = parts.join(" | ").trim();
        return {
          id: entry.id,
          imageURL: entry.imageURL,
          link: entry.link,
          text: title,
          title,
        };
      })
      .filter((entry: RSSEntry) => isValidRSSEntry(entry)),
    id: "https://www.adsoftheworld.com/blog/feed",
    language: "en",
    link: "https://www.adsoftheworld.com/blog/feed",
    title: "Highlighted Campaigns – Ads of the World",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch("https://www.adsoftheworld.com/blog/feed", {
    headers: {
      "Content-Type": "text/html",
      "user-agent": USERAGENT,
    },
  });

  return parse(response);
}
