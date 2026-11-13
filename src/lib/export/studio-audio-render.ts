import type { MixdownPlan } from "@/lib/engine/mixdown";
import { audioBufferToWavBlob } from "@/lib/export/audio-buffer-to-wav";
import { applyGainPoints, scheduleMixItem } from "@/lib/export/audio-schedule";

const SAMPLE_RATE = 44100;

/**
 * Mixes the project's sound off line from a mixdown plan: each clip's span of
 * its file, at its speed and volume curve, starting where it starts on the
 * timeline. Returns a WAV, or null when nothing is audible. A file that cannot
 * be decoded is left out rather than failing the whole export.
 */
export async function renderMixdown(
  plan: MixdownPlan,
  urlFor: (mediaId: string) => string | null,
  signal?: AbortSignal,
): Promise<Blob | null> {
  if (plan.items.length === 0 || plan.duration <= 0) return null;

  const context = new OfflineAudioContext(2, Math.max(1, Math.ceil(plan.duration * SAMPLE_RATE)), SAMPLE_RATE);

  // One decode per file, however many clips use it.
  const decoded = new Map<string, Promise<AudioBuffer | null>>();
  const decode = (mediaId: string) => {
    let pending = decoded.get(mediaId);
    if (!pending) {
      pending = (async () => {
        const url = urlFor(mediaId);
        if (!url) return null;
        try {
          const response = await fetch(url, { signal });
          return await context.decodeAudioData(await response.arrayBuffer());
        } catch {
          return null;
        }
      })();
      decoded.set(mediaId, pending);
    }
    return pending;
  };

  let heard = 0;
  for (const item of plan.items) {
    const buffer = await decode(item.mediaId);
    if (!buffer) continue;
    const schedule = scheduleMixItem(item);

    let source = buffer;
    let offset = schedule.offset;
    if (schedule.reversed) {
      // Play the span backwards: copy it out and flip it.
      const rate = buffer.sampleRate;
      const first = Math.max(0, Math.floor(schedule.offset * rate));
      const length = Math.max(1, Math.min(buffer.length - first, Math.floor(schedule.duration * rate)));
      source = context.createBuffer(buffer.numberOfChannels, length, rate);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const span = buffer.getChannelData(channel).slice(first, first + length);
        source.copyToChannel(span.reverse(), channel);
      }
      offset = 0;
    }

    const node = context.createBufferSource();
    node.buffer = source;
    node.playbackRate.value = schedule.rate;
    const gain = context.createGain();
    if (item.gainPoints.length > 0) applyGainPoints(gain.gain, item.gainPoints);
    node.connect(gain);
    gain.connect(context.destination);
    node.start(schedule.when, offset, schedule.duration);
    heard += 1;
  }

  if (heard === 0) return null;
  return audioBufferToWavBlob(await context.startRendering());
}
