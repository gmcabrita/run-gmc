import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.foriente.pt";
const AJAX_URL = `${BASE_URL}/agenda_ajax.php`;

export async function parse(response: Response): Promise<RSSData> {
  const entries: RSSEntry[] = [];
  let currentEntry: Partial<RSSEntry> & { eventType: string } = { eventType: "" };

  const rewriter = new HTMLRewriter()
    .on(".rectangle[data-id]", {
      element(el) {
        const dataId = el.getAttribute("data-id");
        if (dataId) {
          currentEntry = {
            id: dataId,
            link: `${BASE_URL}/detalhe.php?id=${dataId}`,
            eventType: "",
          };
        }
      },
    })
    .on(".rectangle[data-id] .event-title", {
      text(text) {
        if (text.text) {
          currentEntry.title = (currentEntry.title ?? "") + text.text;
        }
      },
    })
    .on(".rectangle[data-id] .event-date", {
      text(text) {
        if (text.text) {
          currentEntry.text = (currentEntry.text ?? "") + text.text;
        }
      },
    })
    .on(".rectangle[data-id] .event-type", {
      text(text) {
        if (text.text) {
          currentEntry.eventType = (currentEntry.eventType ?? "") + text.text;
        }
      },
      element(el) {
        el.onEndTag(() => {
          if (currentEntry.id && currentEntry.eventType.toLowerCase().includes("cinema")) {
            entries.push({
              id: currentEntry.id,
              link: currentEntry.link ?? "",
              title: currentEntry.title ?? "",
              text: currentEntry.text,
            });
          }
        });
      },
    });

  await consume(rewriter.transform(response).body!);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Museu do Oriente - Cinema",
    description: "Programação de cinema do Museu do Oriente",
    language: "pt",
    entries: entries.filter(isValidRSSEntry),
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(AJAX_URL, {
    method: "POST",
    headers: {
      "User-Agent": USERAGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "categoria=espectaculos&datas=",
  });

  return parse(response);
}
