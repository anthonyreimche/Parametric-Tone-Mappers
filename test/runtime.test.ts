import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi } from "./support/fake-api";

// The runtime holds the host in a module variable, so each test loads its own copy.
const freshRuntime = () => import("../src/runtime");

beforeEach(() => {
  vi.resetModules();
});

describe("runtime", () => {
  it("refuses api() and h() until activate has handed it the host", async () => {
    const { api, h } = await freshRuntime();
    expect(() => api()).toThrow("before activate()");
    expect(() => h("div")).toThrow("before activate()");
  });

  it("hands back the host and builds elements with its React", async () => {
    const { api, h, initRuntime } = await freshRuntime();
    const rig = fakeApi();
    initRuntime(rig.api);
    expect(api()).toBe(rig.api);
    const el = h("div", { id: "x" }, "a", "b");
    expect(el.type).toBe("div");
    expect(el.props).toEqual({ id: "x", children: ["a", "b"] });
  });
});
