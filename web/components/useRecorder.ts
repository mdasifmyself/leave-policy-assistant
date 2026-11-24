"use client";
// Tap to talk: records one question, stops by itself after a short silence
// (or when tapped again), and returns the audio. The level meter is the real
// microphone level, not a fake animation.
import { useCallback, useRef, useState } from "react";

export type RecState = "idle" | "listening" | "error";

const SILENCE_MS = 1500; // stop this long after the speaker goes quiet
const MAX_MS = 20000; // a question never needs longer
const NO_SPEECH_MS = 7000; // give up if nobody speaks

export function useRecorder(onAudio: (blob: Blob) => void) {
  const [state, setState] = useState<RecState>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser records audio differently. Typing works perfectly here.");
      setState("error");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError("To ask by voice, allow the microphone in your browser. Typing works too.");
      setState("error");
      return;
    }
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    const began = performance.now();
    let spoke = false;
    let lastLoud = began;
    let raf = 0;
    let cancelled = false;

    const finish = () => {
      cancelAnimationFrame(raf);
      if (rec.state !== "inactive") rec.stop();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      setLevel(0);
      stopRef.current = null;
      cancelRef.current = null;
    };
    rec.onstop = () => {
      setState("idle");
      if (cancelled) return;
      if (!spoke) {
        setError("Ready when you are. Tap the mic and ask your question.");
        return;
      }
      onAudio(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
    };

    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 12));
      const now = performance.now();
      if (rms > 0.02) {
        spoke = true;
        lastLoud = now;
      }
      if ((spoke && now - lastLoud > SILENCE_MS) || now - began > MAX_MS || (!spoke && now - began > NO_SPEECH_MS)) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    // Tapping the mic again stops early and sends; cancel throws the recording away.
    stopRef.current = () => {
      if (performance.now() - began > 800) spoke = true; // a quiet mic still counts when the user taps stop
      finish();
    };
    cancelRef.current = () => {
      cancelled = true;
      finish();
    };
    rec.start();
    setState("listening");
    raf = requestAnimationFrame(tick);
  }, [onAudio]);

  const stop = useCallback(() => stopRef.current?.(), []);
  const cancel = useCallback(() => cancelRef.current?.(), []);

  return { state, level, error, setError, start, stop, cancel };
}
