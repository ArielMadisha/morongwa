import { extractMentionUsernames, tagNounForPostType } from "../src/utils/tvUserTags";

describe("extractMentionUsernames", () => {
  it("pulls @handles from caption text", () => {
    expect(extractMentionUsernames("Hello @Jane_Doe and @school1")).toEqual(["jane_doe", "school1"]);
  });

  it("ignores emails and short tokens", () => {
    expect(extractMentionUsernames("write me at ariel@qwertymates.com @x hi")).toEqual([]);
  });

  it("dedupes across fields", () => {
    expect(extractMentionUsernames("with @Boitshepo", "cc @boitshepo")).toEqual(["boitshepo"]);
  });
});

describe("tagNounForPostType", () => {
  it("matches Facebook-style photo wording", () => {
    expect(tagNounForPostType("image")).toBe("a photo");
    expect(tagNounForPostType("carousel")).toBe("a photo");
    expect(tagNounForPostType("video")).toBe("a video");
    expect(tagNounForPostType("text")).toBe("a post");
  });
});
