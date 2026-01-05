import { USERAGENT, isValidRSSEntry, consume } from "@rss/common";
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

  const title = currentTitle.trim().replace(/\s+/g, " ");
  if (title && currentDate) {
    const link = `https://www.marktest.com/pod_scope/?date=${currentDate}`;
    const [year, month] = currentDate.split("-").map(Number);
    const datetime = new Date(year, month - 1, 1);

    entries.push({
      id: title,
      link,
      title,
      text: title,
      datetime,
    });
  }

  return {
    id: "https://www.marktest.com/pod_scope/",
    link: "https://www.marktest.com/pod_scope/",
    title: "Marktest POD_SCOPE RANK",
    description: "Ranking Nacional de Podcasts Auditados",
    language: "pt",
    entries: entries.filter((entry: RSSEntry) => isValidRSSEntry(entry)),
  };
}

export async function get(): Promise<RSSData> {
  const response = await fetch("https://www.marktest.com/pod_scope", {
    headers: {
      "User-Agent": USERAGENT,
      "Content-Type": "text/html",
    },
    redirect: "follow",
  });

  return parse(response);
}
