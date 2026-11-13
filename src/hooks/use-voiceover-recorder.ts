"use client";

import * as React from "react";
import { toast } from "sonner";

import { useAudioStore } from "@/store/use-audio-store";
import { useMediaStore } from "@/store/use-media-store";
import { useTimelineStore } from "@/store/use-timeline-store";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * Records narration from the microphone while the timeline plays, then drops
 * the take onto the Voiceover track exactly where recording started. The
 * project stays silent while recording so the mic doesn't pick it up. The
 * take is also uploaded to the media library so it's kept with the project.
 */
export function useVoiceoverRecorder(projectId: string) {
  const [isRecording, setIsRecording] = React.useState(false);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const startRef = React.useRef(0);
  const takeRef = React.useRef(1);

  const cleanup = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    useTimelineStore.getState().setRecording(false);
    setIsRecording(false);
  }, []);

  React.useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const start = React.useCallback(async () => {
    if (recorderRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("This browser can't record audio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      toast.error("Microphone access was blocked. Allow it in your browser to record.");
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const timeline = useTimelineStore.getState();
      timeline.pause();
      const startTime = startRef.current;
      const duration = Math.max(0.2, timeline.playheadTime - startTime);
      cleanup();
      if (chunks.length === 0) return;

      const type = recorder.mimeType || mimeType || "audio/webm";
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const name = `Voiceover ${takeRef.current++}.${ext}`;
      const file = new File(chunks, name, { type });

      const audio = useAudioStore.getState();
      const trackId = audio.ensureVoiceoverTrack(projectId);
      const [mediaId] = useMediaStore.getState().addFiles([file], null);
      audio.addClip(projectId, {
        trackId,
        mediaId: mediaId ?? "",
        // Playable straight away; replaced with the uploaded copy's URL the
        // next time the project loads.
        src: URL.createObjectURL(file),
        name: name.replace(/\.\w+$/, ""),
        startTime,
        sourceDuration: duration,
      });
      toast.success("Voiceover added");
    };

    streamRef.current = stream;
    recorderRef.current = recorder;
    startRef.current = useTimelineStore.getState().playheadTime;
    useTimelineStore.getState().setRecording(true);
    recorder.start(250);
    useTimelineStore.getState().play();
    setIsRecording(true);
  }, [projectId, cleanup]);

  const stop = React.useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else cleanup();
  }, [cleanup]);

  // If playback stops on its own (reached the end), finish the take.
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  React.useEffect(() => {
    if (isRecording && !isPlaying) stop();
  }, [isRecording, isPlaying, stop]);

  return { isRecording, start, stop };
}
