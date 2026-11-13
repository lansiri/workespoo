/**
 * Microphone level for a visual meter only. The samples are reduced to one number and
 * dropped: nothing is analysed, recorded, stored or sent anywhere.
 */
export interface MicMeter {
  stop(): void;
}

export async function startMicMeter(onLevel: (level: number) => void): Promise<MicMeter> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { stop() {} };
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    stream.getTracks().forEach((t) => t.stop());
    return { stop() {} };
  }
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let stopped = false;
  const timer = setInterval(() => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) {
      const d = (v - 128) / 128;
      sum += d * d;
    }
    onLevel(Math.min(1, Math.sqrt(sum / data.length) * 3));
  }, 50);
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close().catch(() => {});
      onLevel(0);
    },
  };
}

/** Ask for microphone permission inside a user gesture, then release the device at once. */
export async function requestMicPermission(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((t) => t.stop());
}
