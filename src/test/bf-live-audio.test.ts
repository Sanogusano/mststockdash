import { describe, expect, it, vi } from "vitest";
import { playChaChing } from "@/pages/BfLive";

function audioContext() {
  const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const source = () => ({ ...node(), start: vi.fn(), stop: vi.fn(), onended: undefined as (() => void) | undefined });
  const gains: ReturnType<typeof gain>[] = [];
  const oscillators: ReturnType<typeof oscillator>[] = [];
  function gain() { return { ...node(), gain: param() }; }
  function oscillator() { return { ...source(), type: "sine", frequency: param() }; }
  const noise = { ...source(), buffer: null };
  const filter = { ...node(), type: "lowpass", frequency: param(), Q: param() };
  const samples = new Float32Array(3840);
  const buffer = { getChannelData: vi.fn(() => samples) };
  const ctx = {
    currentTime: 10, sampleRate: 48000, destination: node(),
    createGain: () => { const g = gain(); gains.push(g); return g; },
    createOscillator: () => { const o = oscillator(); oscillators.push(o); return o; },
    createBuffer: vi.fn(() => buffer), createBufferSource: () => noise, createBiquadFilter: () => filter,
  };
  playChaChing(ctx as unknown as AudioContext);
  return { ctx, gains, oscillators, noise, filter, buffer, samples };
}

describe("Black Friday cash register sound", () => {
  it("routes every voice through a 0.6 master gain", () => {
    const { ctx, gains } = audioContext();
    expect(gains).toHaveLength(9);
    expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(0.6, 10);
    expect(gains[0].connect).toHaveBeenCalledWith(ctx.destination);
    for (const g of gains.slice(1)) expect(g.connect).toHaveBeenCalledWith(gains[0]);
  });
  it("creates the 80ms bandpass metallic noise with the specified envelope", () => {
    const { ctx, noise, filter, gains, buffer, samples } = audioContext();
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 3840, 48000);
    expect(noise.buffer).toBe(buffer);
    expect(samples.every(v => v >= -1 && v <= 1)).toBe(true);
    expect(samples.some(v => v !== 0)).toBe(true);
    expect(filter.type).toBe("bandpass");
    expect(filter.frequency.setValueAtTime).toHaveBeenCalledWith(3000, 10);
    expect(filter.Q.setValueAtTime).toHaveBeenCalledWith(1.2, 10);
    expect(noise.connect).toHaveBeenCalledWith(filter);
    expect(filter.connect).toHaveBeenCalledWith(gains[1]);
    expect(gains[1].gain.setValueAtTime).toHaveBeenCalledWith(0.35, 10);
    expect(gains[1].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, 10.08);
    expect(noise.start).toHaveBeenCalledWith(10);
    expect(noise.stop).toHaveBeenCalledWith(10.08);
  });
  it("adds a 180Hz square body lasting 60ms", () => {
    const { oscillators, gains } = audioContext();
    expect(oscillators[0].type).toBe("square");
    expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(180, 10);
    expect(gains[2].gain.setValueAtTime).toHaveBeenCalledWith(0.08, 10);
    expect(gains[2].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, 10.06);
    expect(oscillators[0].start).toHaveBeenCalledWith(10);
    expect(oscillators[0].stop).toHaveBeenCalledWith(10.06);
  });
  it.each([[0.09, 0.12, 0.6, 0], [0.22, 0.07, 0.45, 1]])("schedules the three bell notes at %ss", (offset, volume, duration, index) => {
    const { oscillators, gains } = audioContext();
    [2093, 2637, 3136].forEach((frequency, i) => {
      const position = 1 + i * 2 + index;
      const o = oscillators[position];
      const g = gains[position + 2];
      expect(o.type).toBe("sine");
      expect(o.frequency.setValueAtTime).toHaveBeenCalledWith(frequency, 10 + offset);
      expect(g.gain.setValueAtTime).toHaveBeenCalledWith(volume, 10 + offset);
      expect(g.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, 10 + offset + duration);
      expect(o.start).toHaveBeenCalledWith(10 + offset);
      expect(o.stop).toHaveBeenCalledWith(10 + offset + duration);
    });
  });
  it("disconnects every node and releases the master only after all voices end", () => {
    const { noise, filter, oscillators, gains } = audioContext();
    noise.onended?.();
    expect(noise.disconnect).toHaveBeenCalledOnce();
    expect(filter.disconnect).toHaveBeenCalledOnce();
    expect(gains[1].disconnect).toHaveBeenCalledOnce();
    for (const o of oscillators.slice(0, -1)) o.onended?.();
    expect(gains[0].disconnect).not.toHaveBeenCalled();
    oscillators.at(-1)?.onended?.();
    for (const o of oscillators) expect(o.disconnect).toHaveBeenCalledOnce();
    for (const g of gains) expect(g.disconnect).toHaveBeenCalledOnce();
  });
});