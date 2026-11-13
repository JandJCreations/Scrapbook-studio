import { audioBufferToWavBlob } from "@/lib/export/audio-buffer-to-wav";
import {
  DUCK_RAMP_SECONDS,
  DUCKED_VOLUME,
  duckingRanges,
  isVoiceoverTrack,
  type AudioClip,
  type AudioTrack,
} from "@/types/audio";

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

  const rendered = await offlineCtx.startRendering();
  return audioBufferToWavBlob(rendered);
}
