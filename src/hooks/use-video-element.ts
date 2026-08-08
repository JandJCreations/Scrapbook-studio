import * as React from "react";

export function useVideoElement(src: string | null) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const video = document.createElement("video");
    video.playsInline = true;
    video.preload = "auto";
    videoRef.current = video;

    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      videoRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setReady(false);
    video.src = src;

    function onLoaded() {
      setReady(true);
    }

    video.addEventListener("loadeddata", onLoaded);
    return () => {
      video.removeEventListener("loadeddata", onLoaded);
    };
  }, [src]);

  return { videoRef, ready };
}
