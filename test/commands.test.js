import { describe, it, expect } from "vitest";
import commands from "../src/core/commands.js";

describe("command-to-action mapping", () => {
  it("maps toggle-play to togglePlay", () => {
    expect(commands.actionForCommand("toggle-play")).toBe("togglePlay");
  });

  it("maps stop to stop", () => {
    expect(commands.actionForCommand("stop")).toBe("stop");
  });

  it("maps skip-section to skipSection", () => {
    expect(commands.actionForCommand("skip-section")).toBe("skipSection");
  });

  it("maps prev-section to prevSection", () => {
    expect(commands.actionForCommand("prev-section")).toBe("prevSection");
  });

  it("returns null for an unknown command", () => {
    expect(commands.actionForCommand("nope")).toBe(null);
    expect(commands.actionForCommand(undefined)).toBe(null);
  });

  it("covers exactly the commands declared in the manifest", () => {
    // Keep the mapping in sync with manifest.json's "commands" block.
    expect(Object.keys(commands.COMMAND_ACTIONS).sort()).toEqual([
      "prev-section",
      "skip-section",
      "stop",
      "toggle-play",
    ]);
  });
});
