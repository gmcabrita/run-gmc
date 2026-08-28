import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.foriente.pt";
const AJAX_URL = `${BASE_URL}/agenda_ajax.php`;

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  let currentEntry: Partial<RSSEntry> & { eventType: string } = { eventType: "" };

  const rewriter = new HTMLRewriter()
    .on(".rectangle[data-id]", {
      element(el) {
        const dataId = el.getAttribute("data-id");
        if (dataId) {
          currentEntry = {
            eventType: "",
            id: dataId,
            link: `${BASE_URL}/detalhe.php?id=${dataId}`,
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
      element(el) {
        el.onEndTag(() => {
          if (currentEntry.id && currentEntry.eventType.toLowerCase().includes("cinema")) {
            entries.push({
              id: currentEntry.id,
              link: currentEntry.link ?? "",
              text: currentEntry.text,
              title: currentEntry.title ?? "",
            });
          }
        });
      },
      text(text) {
        if (text.text) {
          currentEntry.eventType = (currentEntry.eventType ?? "") + text.text;
        }
      },
    });

  await consume(rewriter.transform(response).body!);

  return {
    description: "Programação de cinema do Museu do Oriente",
    entries: entries.filter(isValidRSSEntry),
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Museu do Oriente - Cinema",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(AJAX_URL, {
    body: "categoria=espectaculos&datas=",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USERAGENT,
    },
    method: "POST",
  });

  return parse(response);
}
