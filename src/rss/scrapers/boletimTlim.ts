import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const API_URL = "https://api.github.com/repos/tlimpt/tlimpt.github.io/contents";
const SITE_URL = "https://tlim.pt/";

type GithubContentsFile = {
  name: string;
  path: string;
  downloadUrl: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}

export function parseGithubContentsFiles(json: unknown): GithubContentsFile[] {
  if (!Array.isArray(json)) return [];

  const files: GithubContentsFile[] = [];
  for (const item of json) {
    if (!isRecord(item)) continue;
    if (item.type !== "file") continue;

    const name = typeof item.name === "string" ? item.name : null;
    const path = typeof item.path === "string" ? item.path : null;
    const downloadUrl = typeof item.download_url === "string" ? item.download_url : null;
    if (!name || !path) continue;

    files.push({ name, path, downloadUrl });
  }

  return files;
}

export function isHighEntropyHtmlName(name: string): boolean {
  if (!name.endsWith(".html")) return false;

  const base = name.slice(0, -".html".length);
  if (base.length < 16 || base.length > 64) return false;
  if (!/^[A-Za-z0-9]+$/.test(base)) return false;

  const hasLower = /[a-z]/.test(base);
  const hasUpper = /[A-Z]/.test(base);
  const hasDigit = /\d/.test(base);
  return Number(hasLower) + Number(hasUpper) + Number(hasDigit) >= 2;
}

function toSiteUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}

const PT_MONTH_INDEX: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  marco: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11,
};

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function parsePtMonthYearFromTitle(title: string): Date | null {
  const match = /([\p{L}]+)\s+de\s+(\d{4})\s*$/iu.exec(title);
  if (!match) return null;

  const monthToken = normalizeToken(match[1] ?? "");
  const monthIndex = PT_MONTH_INDEX[monthToken];

  const year = Number(match[2]);
  if (!Number.isSafeInteger(year)) return null;

  if (monthIndex == null) return null;
  return new Date(Date.UTC(year, monthIndex, 1));
}

export function extractHtmlTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;

  const raw = match[1]?.replace(/\s+/g, " ").trim() ?? "";
  return raw.length > 0 ? raw : null;
}

export async function fetchHtmlTitlesByPath(
  files: ReadonlyArray<GithubContentsFile>,
  fetchFn: typeof fetch = fetch,
): Promise<Map<string, string>> {
  const results = await Promise.all(
    files.map(async (file) => {
      if (!file.downloadUrl) return { path: file.path, title: null };

      try {
        const response = await fetchFn(file.downloadUrl, {
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent": USERAGENT,
          },
        });

        if (!response.ok) return { path: file.path, title: null };

        const html = await response.text();
        return { path: file.path, title: extractHtmlTitle(html) };
      } catch {
        return { path: file.path, title: null };
      }
    }),
  );

  const titlesByPath = new Map<string, string>();
  for (const { path, title } of results) {
    if (title) titlesByPath.set(path, title);
  }

  return titlesByPath;
}

function buildEntry(file: GithubContentsFile, htmlTitle: string | null): RSSEntry {
  const link = toSiteUrl(file.path);
  const title = htmlTitle ?? file.name;
  const datetime = parsePtMonthYearFromTitle(title);
  return { id: link, link, title, text: title, datetime: datetime ?? undefined };
}

function buildRSSData(
  files: ReadonlyArray<GithubContentsFile>,
  titlesByPath: ReadonlyMap<string, string>,
): RSSData {
  const now = new Date();
  const entries: RSSEntry[] = files
    .map((f) => buildEntry(f, titlesByPath.get(f.path) ?? null))
    .filter(isValidRSSEntry)
    .filter((entry) => entry.datetime == null || entry.datetime < now)
    .sort((a, b) => {
      const at = a.datetime?.getTime() ?? 0;
      const bt = b.datetime?.getTime() ?? 0;
      return bt - at;
    });

  return {
    id: SITE_URL,
    link: SITE_URL,
    title: "Boletim tlim",
    description: "Boletim tlim",
    language: "pt",
    entries,
  };
}

export function parse(
  json: unknown,
  titlesByPath: ReadonlyMap<string, string> = new Map(),
): RSSData {
  const files = parseGithubContentsFiles(json).filter((f) => isHighEntropyHtmlName(f.name));
  return buildRSSData(files, titlesByPath);
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(API_URL, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": USERAGENT,
    },
  });

  const json: unknown = await response.json();
  const files = parseGithubContentsFiles(json).filter((f) => isHighEntropyHtmlName(f.name));
  const titlesByPath = await fetchHtmlTitlesByPath(files);

  return buildRSSData(files, titlesByPath);
}
