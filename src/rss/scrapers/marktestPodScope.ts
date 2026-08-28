import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  let currentTitle = "";
  let currentDate = "";

  const rewriter = new HTMLRewriter()
    .on("h2#data-title", {
      text(text) {
        if (text.text) {
          currentTitle += text.text;
        }
      },
    })
    .on("select#select-date", {
      element(el) {
        const defaultValue = el.getAttribute("data-defaultvalue");
        if (defaultValue) {
          currentDate = defaultValue;
        }
      },
    });

  await consume(rewriter.transform(response).body!);

  const title = currentTitle.trim().replaceAll(/\s+/g, " ");
  if (title && currentDate) {
    const link = `https://www.marktest.com/pod_scope/?date=${currentDate}`;
    const datetime = new Date();

    entries.push({
      datetime,
      id: link,
      link,
      text: title,
      title,
    });
  }

  return {
    description: "Ranking Nacional de Podcasts Auditados",
    entries: entries.filter((entry: RSSEntry) => isValidRSSEntry(entry)),
    id: "https://www.marktest.com/pod_scope/",
    language: "pt",
    link: "https://www.marktest.com/pod_scope/",
    title: "Marktest POD_SCOPE RANK",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch("https://www.marktest.com/pod_scope", {
    headers: {
      "Content-Type": "text/html",
      "User-Agent": USERAGENT,
    },
    redirect: "follow",
  });

  return parse(response);
}
