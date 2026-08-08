import { audioBufferToWavBlob } from "@/lib/export/audio-buffer-to-wav";
import type { AudioClip, AudioTrack } from "@/types/audio";

export async function mixdownAudio(
  clips: AudioClip[],
  tracks: AudioTrack[],
  durationSeconds: number,
  sampleRate = 44100,
): Promise<Blob | null> {
  const hasSolo = tracks.some((t) => t.solo);

  const audibleClips = clips.filter((clip) => {
    const track = tracks.find((t) => t.id === clip.trackId);
    return !clip.muted && track && !track.muted && (!hasSolo || track.solo);
  });

  if (audibleClips.length === 0) return null;

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
        gainNode.connect(offlineCtx.destination);
        source.start(startTime, clip.trimStart, clipDuration);
      } catch {
        // Skip clips that fail to decode rather than aborting the whole export.
      }
    }),
  );

  const rendered = await offlineCtx.startRendering();
  return audioBufferToWavBlob(rendered);
}
