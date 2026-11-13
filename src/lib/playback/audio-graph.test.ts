import { describe, expect, it } from "vitest";

import {
  createAudioGraph,
  GAIN_TIME_CONSTANT,
  type AudioContextLike,
} from "@/lib/playback/audio-graph";
import { FakeAudioContext, FakeElement } from "@/lib/playback/test-utils";

// Compile-time check: a real AudioContext satisfies AudioContextLike.
const realContextFits = (ctx: AudioContext): AudioContextLike => ctx;
void realContextFits;

describe("createAudioGraph", () => {
it("exposes the master node so a meter can tap it", () => {    const ctx = new FakeAudioContext();    const graph = createAudioGraph(ctx);    expect(graph.master).toBe(ctx.gains[0]);  });
  it("connects a master gain to the destination", () => {
    const ctx = new FakeAudioContext();
    createAudioGraph(ctx);
    expect(ctx.gains).toHaveLength(1);
    expect(ctx.gains[0].connections).toEqual([ctx.destination]);
  });

  it("routes an attached element through its own silent gain into the master", () => {
    const ctx = new FakeAudioContext();
    const graph = createAudioGraph(ctx);
    const element = new FakeElement();
    graph.attach(element);

    const [master, gain] = ctx.gains;
    expect(ctx.sources[0].element).toBe(element);
    expect(ctx.sources[0].node.connections).toEqual([gain]);
    expect(gain.connections).toEqual([master]);
    expect(gain.gain.value).toBe(0);
  });

  it("connects an element only once", () => {
    const ctx = new FakeAudioContext();
    const graph = createAudioGraph(ctx);
    const element = new FakeElement();
    const first = graph.attach(element);
    const second = graph.attach(element);
    expect(second).toBe(first);
    expect(ctx.sources).toHaveLength(1);
  });

  it("gives each element its own gain node", () => {
    const ctx = new FakeAudioContext();
    const graph = createAudioGraph(ctx);
    graph.attach(new FakeElement());
    graph.attach(new FakeElement());
    expect(ctx.gains).toHaveLength(3); // master + two
  });

  it("smooths gain changes from the current time", () => {
    const ctx = new FakeAudioContext();
    const graph = createAudioGraph(ctx);
    const control = graph.attach(new FakeElement());
    ctx.currentTime = 5;
    control.set(0.5);
    expect(ctx.gains[1].gain.calls).toEqual([[0.5, 5, GAIN_TIME_CONSTANT]]);
  });

  it("allows gains above 1 and clamps negative and non-finite gains to 0", () => {
    const ctx = new FakeAudioContext();
    const graph = createAudioGraph(ctx);
    const control = graph.attach(new FakeElement());
    for (const value of [1.5, -1, NaN, Infinity]) control.set(value);
    expect(ctx.gains[1].gain.calls.map((c) => c[0])).toEqual([1.5, 0, 0, 0]);
  });

  it("resumes only a suspended context and reports whether it is running", async () => {
    const ctx = new FakeAudioContext();
    const graph = createAudioGraph(ctx);
    await graph.resume();
    expect(ctx.resumed).toBe(0);

    ctx.state = "suspended";
    expect(graph.isRunning()).toBe(false);
    await graph.resume();
    expect(ctx.resumed).toBe(1);
    expect(graph.isRunning()).toBe(true);
  });

  it("closes the context", async () => {
    const ctx = new FakeAudioContext();
    await createAudioGraph(ctx).close();
    expect(ctx.closed).toBe(1);
  });
});
