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
      id: "https://www.kernel.sh/blog/firecracker-faster",
      link: "https://www.kernel.sh/blog/firecracker-faster",
      title: "how to make firecracker fast(er) to start chromium in < 20ms",
      text: "kernel got our start running chromium in a firecracker vm.",
      datetime: new Date("2026-06-05T13:00:00.000Z"),
      imageURL: "https://cdn.sanity.io/images/7o5bsuld/production/firecracker.png",
    });

    expect(result.entries[1]).toEqual({
      id: "https://www.kernel.sh/blog/scale",
      link: "https://www.kernel.sh/blog/scale",
      title: "Lessons learned from scaling Chromium on bare metal",
      text: "Learn how Kernel runs thousands of Chromium browsers on bare metal.",
      datetime: new Date("2026-05-26T13:18:00.000Z"),
      imageURL: "https://cdn.sanity.io/images/7o5bsuld/production/scale.png",
    });
  });

  it("handles nullable excerpts and escaped titles", async () => {
    const result = await parse(createResponse());

    expect(result.entries[2]).toEqual({
      id: "https://www.kernel.sh/blog/computer-use-2025",
      link: "https://www.kernel.sh/blog/computer-use-2025",
      title: "\"So how are you better than Browserbase?\"",
      text: "",
      datetime: new Date("2025-12-10T14:00:00.000Z"),
      imageURL: "https://cdn.sanity.io/images/7o5bsuld/production/wrapped.png",
    });
  });

  it("keeps posts with malformed optional fields", async () => {
    const nextData = JSON.stringify({
      posts: [
        {
          title: "Tolerant post",
          publishedAt: "2025-01-01T12:00:00Z",
          slug: { current: "tolerant-post" },
          excerpt: 42,
          previewImage: { asset: { url: false } },
          mainImage: { invalid: true },
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
        id: "https://www.kernel.sh/blog/tolerant-post",
        link: "https://www.kernel.sh/blog/tolerant-post",
        title: "Tolerant post",
        text: "",
        datetime: new Date("2025-01-01T12:00:00Z"),
      },
    ]);
  });
});
