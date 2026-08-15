import { describe, expect, it } from "vitest";
import { UNAMBIGUOUS_ALPHABET, randomUnambiguousString } from "./randomCode.js";

// A direct regression test for a real bug: UNAMBIGUOUS_ALPHABET is 31
// characters, not the 32 an earlier version of this code (and its
// callers) assumed -- `byte % 32` against a 31-char alphabet produced
// `undefined` for any byte >= 31 mod 32, which silently vanished when
// the characters were joined into a string, occasionally producing a
// too-short join code or MFA backup code. Generating many strings and
// asserting on their length is exactly the check that would have caught
// this the first time, rather than requiring a live example (a real
// join code that came out 5 characters instead of 6, found by hand).
describe("randomUnambiguousString", () => {
  it("is always exactly the requested length, over many trials", () => {
    for (let i = 0; i < 500; i++) {
      expect(randomUnambiguousString(6)).toHaveLength(6);
      expect(randomUnambiguousString(10)).toHaveLength(10);
    }
  });

  it("only ever contains characters from UNAMBIGUOUS_ALPHABET", () => {
    for (let i = 0; i < 200; i++) {
      const s = randomUnambiguousString(20);
      for (const ch of s) {
        expect(UNAMBIGUOUS_ALPHABET).toContain(ch);
      }
    }
  });

  it("excludes the visually-ambiguous characters (0/O/1/I/L)", () => {
    expect(UNAMBIGUOUS_ALPHABET).not.toMatch(/[0OIL1]/);
  });

  it("is genuinely 31 characters, not the 32 an earlier version assumed", () => {
    expect(UNAMBIGUOUS_ALPHABET).toHaveLength(31);
  });

  it("length 0 returns an empty string, not an error", () => {
    expect(randomUnambiguousString(0)).toBe("");
  });
});
