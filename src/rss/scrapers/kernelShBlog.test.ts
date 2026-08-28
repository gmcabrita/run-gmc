import { describe, expect, it } from "vitest";
import { parse } from "./kernelShBlog";
import html from "./__fixtures__/kernel-sh-blog.html";

function createResponse() {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

describe("kernelShBlog scraper", () => {
  it("parses feed metadata", async () => {
    const result = await parse(createResponse());

    expect(result.id).toBe("https://www.kernel.sh/blog");
    expect(result.link).toBe("https://www.kernel.sh/blog");
    expect(result.title).toBe("Kernel Blog");
    expect(result.description).toBe("Engineering Blog for Fast Browser Agents");
    expect(result.language).toBe("en");
    expect(result.entries).toHaveLength(3);
  });

  it("extracts posts from Next.js data sorted newest first", async () => {
    const result = await parse(createResponse());

    expect(result.entries[0]).toEqual({
      datetime: new Date("2026-06-05T13:00:00.000Z"),
      id: "https://www.kernel.sh/blog/firecracker-faster",
      imageURL: "https://cdn.sanity.io/images/7o5bsuld/production/firecracker.png",
      link: "https://www.kernel.sh/blog/firecracker-faster",
      text: "kernel got our start running chromium in a firecracker vm.",
      title: "how to make firecracker fast(er) to start chromium in < 20ms",
    });

    expect(result.entries[1]).toEqual({
      datetime: new Date("2026-05-26T13:18:00.000Z"),
      id: "https://www.kernel.sh/blog/scale",
      imageURL: "https://cdn.sanity.io/images/7o5bsuld/production/scale.png",
      link: "https://www.kernel.sh/blog/scale",
      text: "Learn how Kernel runs thousands of Chromium browsers on bare metal.",
      title: "Lessons learned from scaling Chromium on bare metal",
    });
  });

  it("handles nullable excerpts and escaped titles", async () => {
    const result = await parse(createResponse());

    expect(result.entries[2]).toEqual({
      datetime: new Date("2025-12-10T14:00:00.000Z"),
      id: "https://www.kernel.sh/blog/computer-use-2025",
      imageURL: "https://cdn.sanity.io/images/7o5bsuld/production/wrapped.png",
      link: "https://www.kernel.sh/blog/computer-use-2025",
      text: "",
      title: "\"So how are you better than Browserbase?\"",
    });
  });

  it("keeps posts with malformed optional fields", async () => {
    const nextData = JSON.stringify({
      posts: [
        {
          excerpt: 42,
          mainImage: { invalid: true },
          previewImage: { asset: { url: false } },
          publishedAt: "2025-01-01T12:00:00Z",
          slug: { current: "tolerant-post" },
          title: "Tolerant post",
        },
      ],
    });
    const encodedNextData = JSON.stringify(nextData).slice(1, -1);
    const response = new Response(
      `<script>self.__next_f.push([1,"${encodedNextData}"])</script>`,
    );
    const result = await parse(response);

    expect(result.entries).toEqual([
      {
        datetime: new Date("2025-01-01T12:00:00Z"),
        id: "https://www.kernel.sh/blog/tolerant-post",
        link: "https://www.kernel.sh/blog/tolerant-post",
        text: "",
        title: "Tolerant post",
      },
    ]);
  });
});
