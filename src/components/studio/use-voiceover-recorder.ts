import * as React from "react";

export type RecorderState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "recording"; startedAt: number };

export interface Recording {
  file: File;
  /** Seconds, measured while recording (the file itself often has no length written in it). */
  duration: number;
}

/** A recording type this browser can make, best first; "" lets the browser choose. */
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function extensionFor(type: string): string {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  return "webm";
}

/**
 * Records from the microphone. `start` asks for the mic (the browser shows its
 * permission prompt the first time); `stop` resolves with the finished file,
 * or null when there was nothing worth keeping.
 */
export function useVoiceoverRecorder() {
  const [state, setState] = React.useState<RecorderState>({ phase: "idle" });
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const startedAtRef = React.useRef(0);

  const release = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  // Leaving the editor mid-recording lets go of the microphone.
  React.useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    release();
  }, [release]);

  /** Null once recording, else why it couldn't start. */
  const start = React.useCallback(async (): Promise<string | null> => {
    if (recorderRef.current) return "Already recording.";
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return "This browser can't record audio.";
    }
    setState({ phase: "starting" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      setState({ phase: "idle" });
      return denied
        ? "Microphone access was blocked. Allow it in your browser's site settings to record."
        : "Couldn't find a microphone to record with.";
    }

    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    streamRef.current = stream;
    recorderRef.current = recorder;
    recorder.start(250);
    startedAtRef.current = performance.now();
    setState({ phase: "recording", startedAt: startedAtRef.current });
    return null;
  }, []);

  const stop = React.useCallback((): Promise<Recording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      release();
      setState({ phase: "idle" });
      return Promise.resolve(null);
    }
    const duration = (performance.now() - startedAtRef.current) / 1000;
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        release();
        setState({ phase: "idle" });
        // A tap on and straight off again is a slip, not a take.
        if (blob.size === 0 || duration < 0.3) return resolve(null);
        const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        const baseType = type.split(";")[0];
        const file = new File([blob], `Voiceover ${stamp}.${extensionFor(baseType)}`, { type: baseType });
        resolve({ file, duration });
      };
      recorder.stop();
    });
  }, [release]);

  return { state, start, stop };
}
