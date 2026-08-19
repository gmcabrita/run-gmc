import { Feed } from "feed";
import type { XUserByScreenNameResponse, XUserTweetsResponse } from "./schemas";

export function isProtectedProfile(data: XUserByScreenNameResponse): boolean {
  return data.data.user.result.legacy.protected === true;
}

export function createPrivateProfileNoticeFeed(userName: string): Feed {
  const profileUrl = `https://x.com/${userName}`;
  const feedUrl = `/rss.x?userName=${encodeURIComponent(userName)}`;

  const feed = new Feed({
    title: `X // ${userName}`,
    description: "This profile is private and cannot be fetched with public credentials.",
    id: profileUrl,
    link: profileUrl,
    language: "en",
    favicon: "https://x.com/favicon.ico",
    updated: new Date(),
    generator: "X2RSS",
  });

  feed.addItem({
    title: "Profile is now private",
    id: `${profileUrl}/private-profile-notice-${new Date().toISOString()}`,
    link: profileUrl,
    content: `<p>This profile is now private and cannot be fetched with public credentials.</p><p>Update your feed URL to remove <code>public=true</code>:</p><p><code>${feedUrl}</code></p>`,
    date: new Date(),
  });

  return feed;
}

export function getTimelineEntries(data: XUserTweetsResponse) {
  return (
    data.data?.user?.result?.timeline_v2?.timeline?.instructions?.find(
      (instruction) => instruction.entries,
    )?.entries ?? []
  );
}
