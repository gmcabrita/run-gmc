import { describe, it, expect } from "vitest";
import { parse } from "./discordQuests";
import json from "./__fixtures__/discord-quests.json";

describe("discordQuests json parser", () => {
  // Use a fixed date that's after most quests in the fixture but before some expire
  const testDate = new Date("2026-01-07T12:00:00+00:00");

  it("parses quests from JSON", () => {
    const result = parse(json, testDate);

    expect(result.id).toBe("https://discord.com/quest-home");
    expect(result.link).toBe("https://discord.com/quest-home");
    expect(result.title).toBe("Discord Quests");
    expect(result.description).toBe("Available Discord Quests");
    expect(result.language).toBe("en");
  });

  it("filters out claimed quests", () => {
    const result = parse(json, testDate);

    // "Where Winds Meet New Year" (1451696588467601408) is claimed
    const claimedQuest = result.entries.find((e) => e.id === "1451696588467601408");
    expect(claimedQuest).toBeUndefined();
  });

  it("filters out expired quests", () => {
    const result = parse(json, testDate);

    // "Storm Lancers Demo" (1443000962024210432) expired on 2025-12-15
    const expiredQuest = result.entries.find((e) => e.id === "1443000962024210432");
    expect(expiredQuest).toBeUndefined();
  });

  it("includes unclaimed and unexpired quests", () => {
    const result = parse(json, testDate);

    // "Alpha vs Omega" (1451341117596504206) - starts 2026-01-06, expires 2026-01-14, user_status is null
    const activeQuest = result.entries.find((e) => e.id === "1451341117596504206");
    expect(activeQuest).toBeDefined();
    expect(activeQuest?.title).toBe("Alpha vs Omega - VALORANT");
  });

  it("extracts correct entry fields", () => {
    const result = parse(json, testDate);

    const activeQuest = result.entries.find((e) => e.id === "1451341117596504206");
    expect(activeQuest).toBeDefined();
    expect(activeQuest?.link).toBe(
      "https://playvalorant.com/?utm_source=discord&utm_medium=paid&utm_campaign=VAL2026Act1",
    );
    expect(activeQuest?.title).toBe("Alpha vs Omega - VALORANT");
    expect(activeQuest?.text).toContain("Riot Games");
    expect(activeQuest?.text).toContain("Viper Mask Avatar Decoration");
    expect(activeQuest?.datetime).toEqual(new Date("2026-01-06T18:00:27+00:00"));
  });

  it("extracts all required fields from entries", () => {
    const result = parse(json, testDate);

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.datetime).toBeInstanceOf(Date);
    }
  });

  it("excludes quests with user_status.claimed_at set", () => {
    const result = parse(json, testDate);

    // All claimed quests should be excluded
    // Check that none of the entries have IDs from claimed quests
    const claimedQuestIds = [
      "1451696588467601408", // Where Winds Meet New Year - claimed
      "1443000962024210432", // Storm Lancers Demo - claimed
      "1447674068815057026", // Where Winds Meet Launch Bundle - claimed
      "1453141810833788928", // Razer - claimed
      "1442590233618026506", // Terminull Brigade - claimed
      "1442944099404742667", // Fallout 76 - claimed
      "1418350811687419914", // The Power of Nitro - claimed
      "1445470742203469834", // The Game Awards - claimed
    ];

    for (const id of claimedQuestIds) {
      const found = result.entries.find((e) => e.id === id);
      expect(found).toBeUndefined();
    }
  });
});
