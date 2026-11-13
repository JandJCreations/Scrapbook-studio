import { audioBufferToWavBlob } from "@/lib/export/audio-buffer-to-wav";
import {
  DUCK_RAMP_SECONDS,
  DUCKED_VOLUME,
  duckingRanges,
  isVoiceoverTrack,
  type AudioClip,
  type AudioTrack,
} from "@/types/audio";
import type { CanvasObject } from "@/types/canvas";

/** A video on the canvas whose own soundtrack should be in the export. */
export interface VideoSound {
  src: string;
  startTime: number;
  endTime: number;
  trimStart: number;
  trimEnd: number;
  playbackRate: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export function videoSoundsFrom(objects: CanvasObject[]): VideoSound[] {
  return objects.flatMap((o) => {
    const v = o.videoAdjustments;
    if (o.type !== "video" || !v || !o.videoSrc || o.isPlaceholder) return [];
    // Reversed audio isn't meaningful; muted is muted.
    if (v.muted || v.reversed || v.volume <= 0) return [];
    return [
      {
        src: o.videoSrc,
        startTime: o.startTime,
        endTime: o.endTime,
        trimStart: v.trimStart,
        trimEnd: v.trimEnd,
        playbackRate: v.playbackRate || 1,
        volume: v.volume / 100,
        fadeIn: o.fadeIn,
        fadeOut: o.fadeOut,
      },
    ];
  });
}

export async function mixdownAudio(
  clips: AudioClip[],
  tracks: AudioTrack[],
  durationSeconds: number,
  sampleRate = 44100,
  videoSounds: VideoSound[] = [],
): Promise<Blob | null> {
  const hasSolo = tracks.some((t) => t.solo);

  const audibleClips = clips.filter((clip) => {
    const track = tracks.find((t) => t.id === clip.trackId);
    return !clip.muted && track && !track.muted && (!hasSolo || track.solo);
  });

  if (audibleClips.length === 0 && videoSounds.length === 0) return null;

  const duckRanges = duckingRanges(clips, tracks);

  const offlineCtx = new OfflineAudioContext(
    2,
    Math.max(1, Math.ceil(durationSeconds * sampleRate)),
    sampleRate,
  );

  await Promise.all(
    audibleClips.map(async (clip) => {
      try {
        const response = await fetch(clip.src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);

        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;

        const gainNode = offlineCtx.createGain();
        const baseVolume = clip.volume / 100;
        const clipDuration = clip.trimEnd - clip.trimStart;
        const startTime = Math.max(0, clip.startTime);
        const endTime = startTime + clipDuration;

        gainNode.gain.setValueAtTime(clip.fadeIn > 0 ? 0 : baseVolume, startTime);
        if (clip.fadeIn > 0) {
          gainNode.gain.linearRampToValueAtTime(
            baseVolume,
            startTime + Math.min(clip.fadeIn, clipDuration),
          );
        }
        if (clip.fadeOut > 0) {
          const fadeStart = Math.max(startTime, endTime - clip.fadeOut);
          gainNode.gain.setValueAtTime(baseVolume, fadeStart);
          gainNode.gain.linearRampToValueAtTime(0, endTime);
        }

        source.connect(gainNode);
        const track = tracks.find((t) => t.id === clip.trackId);
        if (duckRanges.length > 0 && !isVoiceoverTrack(track)) {
          // Music dips under the voiceover, same curve as live playback.
          const duckNode = offlineCtx.createGain();
          duckNode.gain.setValueAtTime(1, 0);
          for (const r of duckRanges) {
            const downStart = Math.max(0, r.start - DUCK_RAMP_SECONDS);
            duckNode.gain.setValueAtTime(1, downStart);
            duckNode.gain.linearRampToValueAtTime(DUCKED_VOLUME, Math.max(downStart, r.start));
            duckNode.gain.setValueAtTime(DUCKED_VOLUME, r.end);
            duckNode.gain.linearRampToValueAtTime(1, r.end + DUCK_RAMP_SECONDS);
          }
          gainNode.connect(duckNode);
          duckNode.connect(offlineCtx.destination);
        } else {
          gainNode.connect(offlineCtx.destination);
        }
        source.start(startTime, clip.trimStart, clipDuration);
      } catch {
        // Skip clips that fail to decode rather than aborting the whole export.
      }
    }),
  );

  // Each video's own sound, at its trim and speed, ducked under voiceover
  // like music. Videos without an audio track simply fail to decode and are
  // skipped.
  await Promise.all(
    videoSounds.map(async (video) => {
      try {
        const response = await fetch(video.src);
        const audioBuffer = await offlineCtx.decodeAudioData(await response.arrayBuffer());
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = video.playbackRate;
        const start = Math.max(0, video.startTime);
        const end = Math.max(start, video.endTime);
        const gain = offlineCtx.createGain();
        gain.gain.setValueAtTime(video.fadeIn > 0 ? 0 : video.volume, start);
        if (video.fadeIn > 0) gain.gain.linearRampToValueAtTime(video.volume, start + video.fadeIn);
        if (video.fadeOut > 0) {
          gain.gain.setValueAtTime(video.volume, Math.max(start, end - video.fadeOut));
          gain.gain.linearRampToValueAtTime(0, end);
        }
        source.connect(gain);
        let tail: AudioNode = gain;
        if (duckRanges.length > 0) {
          const duck = offlineCtx.createGain();
          duck.gain.setValueAtTime(1, 0);
          for (const r of duckRanges) {
            const downStart = Math.max(0, r.start - DUCK_RAMP_SECONDS);
            duck.gain.setValueAtTime(1, downStart);
            duck.gain.linearRampToValueAtTime(DUCKED_VOLUME, Math.max(downStart, r.start));
            duck.gain.setValueAtTime(DUCKED_VOLUME, r.end);
            duck.gain.linearRampToValueAtTime(1, r.end + DUCK_RAMP_SECONDS);
          }
          gain.connect(duck);
          tail = duck;
        }
        tail.connect(offlineCtx.destination);
        const sourceSeconds = Math.min(video.trimEnd - video.trimStart, (end - start) * video.playbackRate);
        source.start(start, video.trimStart, Math.max(0, sourceSeconds));
      } catch {
        // No audio track, or undecodable — export continues silently for it.
      }
    }),
  );

  const rendered = await offlineCtx.startRendering();
  return audioBufferToWavBlob(rendered);
}
