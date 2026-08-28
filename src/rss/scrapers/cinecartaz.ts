import { USERAGENT, isValidRSSEntry, consume } from "@rss/common";
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
          text: "",
          title: "",
        });
      },
    })
    .on(".hobbie-card .hobbie-card__title", {
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry && text.text) {
          lastEntry.title = (lastEntry.title || "") + text.text;
        }
      },
    })
    .on(".hobbie-card a.button--hobbie", {
      element(el) {
        const lastEntry = entries.at(-1);
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
        const lastEntry = entries.at(-1);
        const src = el.getAttribute("src");
        if (lastEntry && src) {
          lastEntry.imageURL = src;
        }
      },
    });

  await consume(rewriter.transform(response).body!);
  return {
    description: "Passatempos | Cinecartaz",
    entries: entries
      .map((entry) => ({
        ...entry,
        text: entry.title.trim().replaceAll("\n", " | "),
        title: entry.title.trim().replaceAll("\n", " | "),
      }))
      .filter((entry: RSSEntry) => isValidRSSEntry(entry)),
    id: "https://cinecartaz.publico.pt/passatempos",
    language: "pt",
    link: "https://cinecartaz.publico.pt/passatempos",
    title: "Passatempos | Cinecartaz",
  };
}

export async function get(): Promise<RSSData> {
  const response = await fetch("https://cinecartaz.publico.pt/passatempos", {
    headers: {
      "Content-Type": "text/html",
      "user-agent": USERAGENT,
    },
  });

  return parse(response);
}

export async function sendCinecartazEntriesByEmail(env: CloudflareBindings) {
  const data = await get();

  for (const entry of data.entries) {
    await idempotentSendEmail(env, {
      body: `<h2><a href="${entry.link}">${entry.title}</a></h2>
              <p>${entry.text}</p>${entry.imageURL ? `<br><img src="${entry.imageURL}"></img>` : ""}`.trim(),
      idempotencyKey: `cinecartaz-${entry.id}`,
      subject: `[Passatempo Cinecartaz] ${entry.title}`,
      to: "goncalo.mendes.cabrita@gmail.com",
    });
  }

  return data;
}
