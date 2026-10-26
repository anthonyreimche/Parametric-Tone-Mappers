// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FloatFrame, ParamScope } from "../src/safelight";
import { fakeApi, frameOf, maskScope } from "./support/fake-api";

afterEach(cleanup);

describe("fakeApi", () => {
  it("re-renders a component that reads through the param scope when a write lands", () => {
    const rig = fakeApi();
    const Probe = () => React.createElement("p", null, String(rig.api.develop.useParamScope().getParam("t.x.gain") ?? "none"));
    const { container } = render(React.createElement(Probe));
    expect(container.textContent).toBe("none");
    act(() => rig.develop.getState().setDynParams({ "t.x.gain": 2 }));
    expect(container.textContent).toBe("2");
  });

  it("hands a new scope object when the bag changes and the same one while it doesn't", () => {
    const rig = fakeApi();
    const seen: ParamScope[] = [];
    const Probe = () => {
      seen.push(rig.api.develop.useParamScope());
      return null;
    };
    const { rerender } = render(React.createElement(Probe));
    rerender(React.createElement(Probe));
    expect(seen[1]).toBe(seen[0]);
    act(() => rig.develop.getState().setDynParams({ "t.x.gain": 2 }));
    expect(seen[seen.length - 1]).not.toBe(seen[0]);
  });

  it("answers getParam with the registered default where the bag has no value, getParams without defaults", () => {
    const rig = fakeApi({ bag: { "t.x.gain": 3 } });
    rig.api.registerPipeline({
      id: "t.x",
      name: "x",
      params: [
        { key: "gain", glslType: "float", default: 1 },
        { key: "mix", glslType: "float", default: 0.5 },
      ],
    });
    const seen: ParamScope[] = [];
    const Probe = () => {
      seen.push(rig.api.develop.useParamScope());
      return null;
    };
    render(React.createElement(Probe));
    expect(seen[0].getParam("t.x.gain")).toBe(3);
    expect(seen[0].getParam("t.x.mix")).toBe(0.5);
    expect(seen[0].getParam("t.x.unknown")).toBeUndefined();
    expect(seen[0].getParams()).toEqual({ "t.x.gain": 3 });
  });

  it("resolves a display transform pick only while it is registered, else the default, else the built-in", () => {
    const rig = fakeApi({ defaultTransform: "t.def" });
    const { effectiveId } = rig.api.pipelines;
    expect(effectiveId("t.x")).toBe("core.pipeline");
    rig.api.registerPipeline({ id: "t.def", name: "default" });
    expect(effectiveId("t.x")).toBe("t.def");
    expect(effectiveId(null)).toBe("t.def");
    rig.api.registerPipeline({ id: "t.x", name: "x" });
    expect(effectiveId("t.x")).toBe("t.x");
  });

  it("follows the Preferences default as the pipeline store changes", () => {
    const rig = fakeApi();
    rig.api.registerPipeline({ id: "t.def", name: "default" });
    expect(rig.api.pipelines.effectiveId(null)).toBe("core.pipeline");
    rig.api.stores.usePipelineStore.setState({ activeId: "t.def" });
    expect(rig.api.pipelines.effectiveId(null)).toBe("t.def");
  });

  // The core's commitEdit (src/state/develop-store.ts): an edit that records the look of the last step costs no
  // step, with a bag key set to undefined counting as absent (src/catalog/edit-equality.ts), and nothing commits
  // without an open photo.
  describe("commitEdit", () => {
    it("drops a commit that changes nothing since the last", async () => {
      const rig = fakeApi({ bag: { "t.x.gain": 1 } });
      const dev = () => rig.develop.getState();
      await dev().commitEdit("Nothing");
      dev().setDynParams({ "t.x.gain": 2 });
      await dev().commitEdit("Gain");
      await dev().commitEdit("Again");
      dev().setDynParams({ "t.x.gain": 2 });
      await dev().commitEdit("Same");
      dev().setParam("displayTransform", "t.y");
      await dev().commitEdit("Pick");
      expect(rig.commits).toEqual(["Gain", "Pick"]);
    });

    it("counts a bag key set to undefined as absent", async () => {
      const rig = fakeApi();
      rig.develop.getState().setDynParams({ "t.x.gain": undefined });
      await rig.develop.getState().commitEdit("Cleared");
      expect(rig.commits).toEqual([]);
    });

    it("commits nothing without an open photo", async () => {
      const rig = fakeApi();
      rig.develop.setState({ photoId: null });
      rig.develop.getState().setDynParams({ "t.x.gain": 2 });
      await rig.develop.getState().commitEdit("Gain");
      expect(rig.commits).toEqual([]);
    });
  });

  it("lists a transform's declared keys once it is registered, none before", () => {
    const rig = fakeApi({ bag: { "t.x.gain": 2 } });
    expect(rig.api.pipelines.paramKeys?.("t.x")).toEqual([]);
    rig.api.registerPipeline({ id: "t.x", name: "x", params: [{ key: "gain", glslType: "float", default: 1 }] });
    expect(rig.api.pipelines.paramKeys?.("t.x")).toEqual(["t.x.gain"]);
  });

  it("answers captureFloatFrame with the frame it was given, records the options, rejects, or leaves the method off", async () => {
    const frame = frameOf(1, 1, () => [0.5, 0.5, 0.5]);
    const rig = fakeApi({ frame });
    const params = rig.develop.getState().params;
    expect(await rig.api.develop.captureFloatFrame?.(params, { point: "scene", maxEdge: 64 })).toBe(frame);
    expect(rig.captures).toEqual([{ point: "scene", maxEdge: 64 }]);
    expect(await fakeApi({ frame: null }).api.develop.captureFloatFrame?.(params)).toBeNull();
    await expect(fakeApi({ frame: "fails" }).api.develop.captureFloatFrame?.(params)).rejects.toThrow();
    expect(fakeApi({ frame: "missing" }).api.develop.captureFloatFrame).toBeUndefined();
  });

  it("holds a captureFloatFrame back until the frame it was given as a promise settles", async () => {
    let land!: (f: FloatFrame | null) => void;
    const frame = frameOf(1, 1, () => [0.5, 0.5, 0.5]);
    const rig = fakeApi({ frame: new Promise<FloatFrame | null>((resolve) => (land = resolve)) });
    let got: FloatFrame | null | undefined;
    const capture = rig.api.develop.captureFloatFrame?.(rig.develop.getState().params).then((f) => (got = f));
    await Promise.resolve();
    expect(got).toBeUndefined();
    land(frame);
    await capture;
    expect(got).toBe(frame);
  });

  // The Masking panel's scope (src/modules/develop/mask-scope.tsx): reads, writes and re-renders belong to the
  // mask's bag, and the photo's stays as it is; a commit is still one undo step of the develop store.
  describe("maskScope", () => {
    const setup = () => {
      const rig = fakeApi({ bag: { "t.x.gain": 1 } });
      rig.api.registerPipeline({
        id: "t.x",
        name: "x",
        params: [
          { key: "gain", glslType: "float", default: 0.5 },
          { key: "mix", glslType: "float", default: 0.25 },
        ],
      });
      const mask = maskScope(rig, { "t.x.gain": 7 });
      let scope!: ParamScope;
      const Probe = () => {
        scope = rig.api.develop.useParamScope();
        return React.createElement("p", null, String(scope.getParams()["t.x.gain"]));
      };
      const view = render(React.createElement(mask.Provider, null, React.createElement(Probe)));
      return { rig, mask, view, scope: () => scope };
    };

    it("hands a component inside it the mask's bag, with the registered defaults beneath", () => {
      const { view, scope } = setup();
      expect(view.container.textContent).toBe("7");
      expect(scope().maskId).not.toBeNull();
      expect(scope().getParam("t.x.mix")).toBe(0.25);
    });

    it("writes to the mask's bag only, re-renders, and commits through the develop store", () => {
      const { rig, mask, view, scope } = setup();
      act(() => scope().setParams({ "t.x.gain": 9 }));
      expect(view.container.textContent).toBe("9");
      expect(mask.bag()).toEqual({ "t.x.gain": 9 });
      expect(rig.develop.getState().paramBag).toEqual({ "t.x.gain": 1 });
      scope().commit("Gain");
      expect(rig.commits).toEqual(["Gain"]);
    });

    it("counts the mask as part of the photo's look before any edit, so a commit without one records nothing", () => {
      const { rig, scope } = setup();
      scope().commit("Nothing");
      expect(rig.commits).toEqual([]);
    });

    it("leaves a component outside it on the photo's scope", () => {
      const { rig } = setup();
      let outside!: ParamScope;
      const Probe = () => {
        outside = rig.api.develop.useParamScope();
        return null;
      };
      render(React.createElement(Probe));
      expect(outside.maskId).toBeNull();
      expect(outside.getParams()).toEqual({ "t.x.gain": 1 });
    });
  });

  // The core Slider (src/ui/components/Slider.tsx). Its pointer drag and rAF-coalesced writes are not reproduced:
  // a mouse-up stands in for the end of a drag. What is: a double-click sets the default (0 without one) and
  // commits; a key-up commits after the keys that move the value only; the value field shows a positive value
  // with a plus sign, passes a typed finite one on unclamped, and commits on blur.
  describe("Slider", () => {
    const draw = (extra: { defaultValue?: number; value?: number }) => {
      const seen: number[] = [];
      let commits = 0;
      const { Slider } = fakeApi().api.components;
      render(React.createElement(Slider, { label: "Gain", value: 3, ...extra, onChange: (v) => seen.push(v), onCommit: () => commits++ }));
      return { seen, commits: () => commits };
    };
    const value = () => (screen.getByRole("textbox", { name: "Gain value" }) as HTMLInputElement).value;

    it("resets to its defaultValue on a double-click and commits", () => {
      const s = draw({ defaultValue: 1.5 });
      fireEvent.doubleClick(screen.getByRole("slider", { name: "Gain" }));
      expect(s.seen).toEqual([1.5]);
      expect(s.commits()).toBe(1);
    });

    it("resets to 0 when it has no defaultValue", () => {
      const s = draw({});
      fireEvent.doubleClick(screen.getByRole("slider", { name: "Gain" }));
      expect(s.seen).toEqual([0]);
    });

    it("spans -100 to 100 in steps of 1 unless told otherwise", () => {
      draw({});
      const input = screen.getByRole("slider", { name: "Gain" }) as HTMLInputElement;
      expect([input.min, input.max, input.step]).toEqual(["-100", "100", "1"]);
    });

    it("shows its value signed in a field", () => {
      draw({ value: 3 });
      expect(value()).toBe("+3");
      cleanup();
      draw({ value: -2.5 });
      expect(value()).toBe("-2.5");
      cleanup();
      draw({ value: 0 });
      expect(value()).toBe("0");
    });

    it("passes a typed number on past the slider's range, and ignores an unfinished one", () => {
      const s = draw({});
      const field = screen.getByRole("textbox", { name: "Gain value" });
      fireEvent.change(field, { target: { value: "250" } });
      fireEvent.change(field, { target: { value: "-" } });
      fireEvent.change(field, { target: { value: "" } });
      expect(s.seen).toEqual([250]);
    });

    it("commits on a mouse-up, as the end of a drag", () => {
      const s = draw({});
      fireEvent.mouseUp(screen.getByRole("slider", { name: "Gain" }));
      expect(s.commits()).toBe(1);
    });

    it("commits on a key-up after each key that moves the value", () => {
      const s = draw({});
      const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
      for (const key of keys) fireEvent.keyUp(screen.getByRole("slider", { name: "Gain" }), { key });
      expect(s.commits()).toBe(keys.length);
    });

    it("commits on no other key-up, such as undo or redo", () => {
      const s = draw({});
      for (const key of ["z", "Control", "Shift", "Tab", "Enter"]) fireEvent.keyUp(screen.getByRole("slider", { name: "Gain" }), { key });
      expect(s.commits()).toBe(0);
    });

    it("commits when the value field loses focus", () => {
      const s = draw({});
      fireEvent.blur(screen.getByRole("textbox", { name: "Gain value" }));
      expect(s.commits()).toBe(1);
      expect(s.seen).toEqual([]);
    });
  });
});
