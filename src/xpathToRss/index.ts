import { Hono } from "hono";
import { Feed } from "feed";
import XPath from "xpath";
import { DOMParser } from "@xmldom/xmldom";
import type { Context } from "hono";
import { idempotentSendEmail } from "@email";
import type { XPathRssPost } from "@types";

const CINECARTAZ_XPATH_CONFIG = {
  title: "Passatempos | Cinecartaz",
  link: "https://cinecartaz.publico.pt/passatempos",
  xpath: {
    post: "//div[contains(concat(' ', normalize-space(string(@class)), ' '), ' hobbie-card ')]",
    title: ".//h3[contains(string(@class), 'hobbie-card__title')][substring(., 12)]",
    link: ".//a[contains(string(@class), 'button--hobbie')]/@href",
    image: ".//div[contains(string(@class), 'hobbie-card__image')]/img/@src",
  },
};

export async function sendCinecartazEntriesByEmail(env: CloudflareBindings) {
  const posts = await xpathToObject(CINECARTAZ_XPATH_CONFIG);

  for (const post of posts) {
    await idempotentSendEmail(env, {
      to: "goncalo@mendescabrita.com",
      subject: `[Passatempo] ${post.title}`,
      body: `<h2><a href="${post.link}">${post.title}</a></h2>
              <p>${post.content}</p>`.trim(),
      idempotencyKey: `cinecartaz-${post.id}`,
    });
  }
}

async function xpathToObject({
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
}): Promise<XPathRssPost[]> {
  const response = await fetch(fetchUrl || link, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      "Content-Type": "application/json",
    },
  });
  let html = await response.text();

  const domParser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => {},
      fatalError: (err) => {
        throw new Error(err);
      },
    },
  });

  if (!html.includes("</html>")) {
    html = `<html>${html}</html>`;
  }

  const document = domParser.parseFromString(html, "text/xml");

  const posts = XPath.select(xpath.post, document) as Node[];

  return posts.map((postNode: Node) => {
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

    return {
      id: postUrl,
      title: postTitle || "",
      link: postUrl,
      content: `${content}<a href="${postUrl}">${postUrl}</a>${image}`.trim(),
      date: datetimeText ? new Date(datetimeText) : new Date(),
    };
  });
}

async function xpathToRss(
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
    description: title,
    id: link,
    link,
    language: "en",
    copyright: "",
    updated: new Date(),
  });

  const posts = await xpathToObject({
    title,
    link,
    fetchUrl,
    xpath,
  });
  posts.forEach((post) => {
    feed.addItem(post);
  });

  ctx.header("Content-Type", "application/rss+xml");
  ctx.header("Cache-Control", "public, max-age=300");
  return ctx.text(feed.rss2());
}

export function addXpathToRssEndpoints(app: Hono<{ Bindings: CloudflareBindings }>) {
  app.get("/rss.ercNoticias", async (c) => {
    return await xpathToRss(c, {
      title: "Noticias ERC",
      link: "https://www.erc.pt/pt/a-erc/noticias/",
      xpath: {
        post: `//div[contains(string(@class), 'news__article')]/article`,
        title: ".//h1/text()",
        link: ".//a[contains(string(@class), 'news__article__title')]/@href",
        content: ".//div/p/text()",
      },
    });
  });

  app.get("/rss.ercDeliberacoes", async (c) => {
    return await xpathToRss(c, {
      title: "Deliberações ERC",
      link: "https://www.erc.pt/pt/deliberacoes/deliberacoes-erc/",
      xpath: {
        post: `//*[@id="webreader"]/main/div[3]/div/div/div[contains(string(@class), 'item')]`,
        title: ".//h1[contains(string(@class), 'item__title')][substring(., 12)]",
        link: ".//a[contains(string(@title), 'Download')]/@href",
        content: ".//div[contains(string(@class), 'item__desc')]/text()[1]",
      },
    });
  });

  app.get("/rss.sendCinecartazEntriesByEmail", async (c) => {
    await sendCinecartazEntriesByEmail(c.env);
    return c.text("");
  });

  app.get("/rss.cinecartaz", async (c) => {
    return await xpathToRss(c, CINECARTAZ_XPATH_CONFIG);
  });

  app.get("/rss.impresaInvestidores", async (c) => {
    return await xpathToRss(c, {
      title: "Impresa – Investidores",
      link: "https://thewaltdisneycompany.com/press-releases/",
      fetchUrl: "https://www.impresa.pt/api/molecule/category/pt/investidores?types=MEDIA&limit=50",
      xpath: {
        post: `//li/div[contains(string(@class), 'wrapper-news')]`,
        title: ".//h1/a/text()",
        link: ".//h1/a/@href",
        datetime: ".//p[contains(string(@class), 'publishedDate')]/@datetime",
      },
    });
  });

  app.get("/rss.waltDisneyPressReleases", async (c) => {
    return await xpathToRss(c, {
      title: "Press Releases Archives - The Walt Disney Company",
      link: "https://thewaltdisneycompany.com/press-releases/",
      xpath: {
        post: `//div[contains(string(@class), 'press-releases-container')]/article`,
        title: ".//h2/a/text()",
        link: ".//h2/a/@href",
        content: ".//h2/a/text()",
        datetime: ".//time/@datetime",
      },
    });
  });

  app.get("/rss.adsOfTheWorldBlog", async (c) => {
    return await xpathToRss(c, {
      title: "Highlighted Campaigns – Ads of the World",
      link: "https://www.adsoftheworld.com/blog/feed",
      xpath: {
        post: "//*[contains(string(@id), 'campaign_card_')]",
        title: "./child::node()[substring(., 12)]",
        link: ".//a/@href",
        image: "./div[1]/div[1]/a/picture/img/@src",
      },
    });
  });

  app.get("/rss.kitLangtonBlog", async (c) => {
    return await xpathToRss(c, {
      title: "Kit Langton",
      link: "https://www.kitlangton.com/",
      xpath: {
        post: "/html/body/main/div[7]/div/div[1]/div[2]/a",
        title: "./child::node()[substring(., 12)]",
        link: "./ancestor-or-self::node()/@href",
      },
    });
  });

  app.get("/rss.walzrBlog", async (c) => {
    return await xpathToRss(c, {
      title: "Riley Walz",
      link: "https://walzr.com/",
      xpath: {
        post: "//a[contains(string(@href), '/blog/')]",
        title: "./text()",
        link: "./@href",
      },
    });
  });

  app.get("/rss.jeremyEvansBlog", async (c) => {
    return await xpathToRss(c, {
      title: "Jeremy Evans",
      link: "https://code.jeremyevans.net/",
      xpath: {
        post: "/html/body/div/ul/li/a",
        title: "./child::node()[substring(., 12)]",
        link: "./ancestor-or-self::node()/@href",
      },
    });
  });

  app.get("/rss.kirShatrovBlog", async (c) => {
    return await xpathToRss(c, {
      title: "Kir Shatrov",
      link: "https://kirshatrov.com/posts/",
      xpath: {
        post: "/html/body/div/main/div/div/div/div/div/a[contains(@href, '/posts/')]",
        title: "child::node()",
        link: "ancestor-or-self::node()/@href",
      },
    });
  });
}
