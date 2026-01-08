import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { idempotentSendEmail } from "@email";

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const rewriter = new HTMLRewriter()
    .on(".hobbie-card", {
      element() {
        entries.push({
          id: "",
          link: "",
          title: "",
          text: "",
        });
      },
    })
    .on(".hobbie-card .hobbie-card__title", {
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.title = (lastEntry.title || "") + text.text;
        }
      },
    })
    .on(".hobbie-card a.button--hobbie", {
      element(el) {
        const lastEntry = entries[entries.length - 1];
        const href = el.getAttribute("href");
        if (lastEntry && href) {
          const link = new URL(href, "https://cinecartaz.publico.pt").href;
          lastEntry.id = link;
          lastEntry.link = link;
        }
      },
    })
    .on(".hobbie-card .hobbie-card__image img", {
      element(el) {
        const lastEntry = entries[entries.length - 1];
        const src = el.getAttribute("src");
        if (lastEntry && src) {
          lastEntry.imageURL = src;
        }
      },
    });

  await consume(rewriter.transform(response).body!);
  return {
    id: "https://cinecartaz.publico.pt/passatempos",
    link: "https://cinecartaz.publico.pt/passatempos",
    title: "Passatempos | Cinecartaz",
    description: "Passatempos | Cinecartaz",
    language: "pt",
    entries: entries
      .map((entry) => ({
        ...entry,
        title: entry.title.trim().replace(/\n/g, " | "),
        text: entry.title.trim().replace(/\n/g, " | "),
      }))
      .filter((entry: RSSEntry) => isValidRSSEntry(entry)),
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch("https://cinecartaz.publico.pt/passatempos", {
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "text/html",
    },
  });

  return parse(response);
}

export async function sendCinecartazEntriesByEmail(env: CloudflareBindings) {
  const data = await get();

  for (const entry of data.entries) {
    await idempotentSendEmail(env, {
      to: "goncalo@mendescabrita.com",
      subject: `[Passatempo] ${entry.title}`,
      body: `<h2><a href="${entry.link}">${entry.title}</a></h2>
              <p>${entry.text}</p>${entry.imageURL ? `<br><img src="${entry.imageURL}"></img>` : ""}`.trim(),
      idempotencyKey: `cinecartaz-${entry.id}`,
    });
  }

  return data;
}
