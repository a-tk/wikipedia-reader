import { describe, it, expect } from "vitest";
import hello from "../src/core/hello.js";

describe("hello smoke test", () => {
  it("returns a ready message", () => {
    expect(hello.hello()).toBe("Wikipedia Reader ready.");
  });

  it("includes a name when given", () => {
    expect(hello.hello("Ada")).toBe("Wikipedia Reader ready, Ada.");
  });
});
