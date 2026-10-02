import { describe, it, expect } from "vitest";
import { SHARED_VERSION } from "./index.ts";

describe("shared package", () => {
  it("exports a version", () => {
    expect(SHARED_VERSION).toBe("0.0.1");
  });
});
