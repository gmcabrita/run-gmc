import type { Hono } from "hono";
import { idempotentSendEmail } from "@email";
import { USERAGENT, consume, decodeHtmlEntities } from "@rss/common";
import { CINECARTAZ_QUESTION_WATCHES } from "./watches";

const NO_BREAK_SPACE = String.fromCodePoint(0xa0);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x20_0b);
const NOTIFICATION_EMAIL = "goncalo.mendes.cabrita@gmail.com";
// Before the question goes live the description says it "aqui será colocada".
const QUESTION_PLACEHOLDER_PATTERN = /ser[áa]\s+colocad[ao]/i;

export type CinecartazQuestionStatus = {
  description: string;
  posted: boolean;
  title: string;
};

export async function parseCinecartazQuestionPage(
  response: Response,
): Promise<CinecartazQuestionStatus> {
  let title = "";
  let description = "";

  const rewriter = new HTMLRewriter()
    .on("article.movie-detail .movie-detail__section-title", {
      text(text) {
        title += text.text;
      },
    })
    .on("article.movie-detail .boxed.boxed_border p", {
      element() {
        description += "\n";
      },
    })
    .on("article.movie-detail .boxed.boxed_border br", {
      element() {
        description += "\n";
      },
    })
    .on("article.movie-detail .boxed.boxed_border", {
      text(text) {
        // Line breaks come from <p> and <br>; source newlines are just markup wrapping.
        description += text.text.replaceAll(/\s+/g, " ");
      },
    });

  await consume(rewriter.transform(response).body!);

  const normalizedDescription = decodeHtmlEntities(description)
    .replaceAll(NO_BREAK_SPACE, " ")
    .replaceAll(ZERO_WIDTH_SPACE, "")
    .split("\n")
    .map((line) => line.replaceAll(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  // An empty description means the page layout changed or the page is gone,
  // which must not be mistaken for the placeholder having been replaced.
  const posted =
    normalizedDescription.length > 0 &&
    (normalizedDescription.includes("?") ||
      !QUESTION_PLACEHOLDER_PATTERN.test(normalizedDescription));

  return {
    description: normalizedDescription,
    posted,
    title: decodeHtmlEntities(title).replaceAll(/\s+/g, " ").trim(),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildCinecartazQuestionEmail(url: string, status: CinecartazQuestionStatus) {
  const paragraphs = status.description
    .split("\n")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("\n");

  return {
    body: `<h2><a href="${escapeHtml(url)}">${escapeHtml(status.title)}</a></h2>\n${paragraphs}`,
    subject: `[Passatempo Cinecartaz] Pergunta publicada: ${status.title}`,
  };
}

export async function sendCinecartazQuestionsByEmail(env: CloudflareBindings) {
  const results: Array<CinecartazQuestionStatus & { emailed: boolean; url: string }> = [];

  for (const url of CINECARTAZ_QUESTION_WATCHES) {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "text/html",
        "user-agent": USERAGENT,
      },
    });
    if (!response.ok) {
      throw new Error(`Cinecartaz passatempo ${url} returned ${response.status}`);
    }

    const status = await parseCinecartazQuestionPage(response);
    let emailed = false;
    if (status.posted) {
      emailed = await idempotentSendEmail(env, {
        ...buildCinecartazQuestionEmail(url, status),
        idempotencyKey: `cinecartaz-question-${url}`,
        to: NOTIFICATION_EMAIL,
      });
    }

    results.push({ ...status, emailed, url });
  }

  return results;
}

export function addCinecartazQuestionEndpoints(app: Hono<{ Bindings: CloudflareBindings }>): void {
  app.get("/cinecartaz.sendPassatempoQuestionsByEmail", async (ctx) => {
    return ctx.json(await sendCinecartazQuestionsByEmail(ctx.env), 200, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });
}
