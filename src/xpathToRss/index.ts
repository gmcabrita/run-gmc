import { Feed } from "feed";
import XPath from "xpath";
import { DOMParser } from "@xmldom/xmldom";
import type { Context } from "hono";

export async function xpathToRss(
  ctx: Context,
  {
    title,
    link,
    fetchUrl,
    xpath,
  }: {
    title: string;
    link: string;
    fetchUrl?: string;
    xpath: {
      post: string;
      title: string;
      link: string;
      content?: string;
      image?: string;
      datetime?: string;
    };
  },
): Promise<Response> {
  const feed = new Feed({
    title,
    id: link,
    link,
    language: "en",
    copyright: "",
    updated: new Date(),
  });

  const response = await fetch(fetchUrl || link, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      "Content-Type": "application/json",
    },
  });
  const html = await response.text();

  const domParser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => {},
      fatalError: (err) => {
        throw new Error(err);
      },
    },
  });

  const document = domParser.parseFromString(html, "text/xml");

  const posts: any = XPath.select(xpath.post, document);

  posts.forEach((postNode: Node) => {
    const titleNode = XPath.select1(xpath.title, postNode) as Node | undefined;
    const postTitle = titleNode?.textContent?.trim()?.split("\n")?.join(" | ");
    const linkNode = XPath.select1(xpath.link, postNode) as Attr | undefined;
    const postUrl = new URL(linkNode?.value || "", link).href;
    const contentNode = xpath.content
      ? (XPath.select1(xpath.content, postNode) as Node | undefined)
      : null;
    const contentText = contentNode?.textContent?.trim()?.split("\n")?.join(" | ");
    const content = contentText ? `<p>${contentText}</p>` : "";
    const imageNode = xpath.image
      ? (XPath.select1(xpath.image, postNode) as Attr | undefined)
      : null;
    const imageUrl = imageNode?.value;
    const image = imageUrl ? `<br><img src="${imageUrl}"></img>` : "";
    const datetimeNode = xpath.datetime
      ? (XPath.select1(xpath.datetime, postNode) as Attr | undefined)
      : null;
    const datetimeText = datetimeNode?.value?.trim();

    feed.addItem({
      title: postTitle || "",
      link: postUrl,
      id: postUrl,
      content: `${content}<a href="${postUrl}">${postUrl}</a>${image}`.trim(),
      date: datetimeText ? new Date(datetimeText) : new Date(),
    });
  });

  ctx.header("Content-Type", "application/rss+xml");
  ctx.header("Cache-Control", "public, max-age=300");
  return ctx.text(feed.rss2());
}
