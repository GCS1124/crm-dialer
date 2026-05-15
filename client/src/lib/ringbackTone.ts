const RINGBACK_ON_DURATION_MS = 2000;
const RINGBACK_OFF_DURATION_MS = 4000;
const RINGBACK_GAIN_LEVEL = 0.12;
const RINGBACK_FREQUENCIES = [440, 480];

export interface RingbackGainNodeLike {
  gain: { value: number };
  connect(destination: unknown): void;
  disconnect(): void;
}

export interface RingbackOscillatorNodeLike {
  frequency: { value: number };
  type: OscillatorType;
  connect(destination: RingbackGainNodeLike): void;
  start(): void;
  stop(): void;
  disconnect(): void;
}

export interface RingbackAudioContextLike {
  destination: unknown;
  createGain(): RingbackGainNodeLike;
  createOscillator(): RingbackOscillatorNodeLike;
  resume(): Promise<void> | void;
  close(): Promise<void> | void;
}

export interface RingbackToneController {
  start(): void;
  stop(): void;
  isPlaying(): boolean;
}

export interface RingbackToneControllerDependencies {
  createAudioContext: () => RingbackAudioContextLike | null;
  setTimeout: (callback: () => void, delay: number) => any;
  clearTimeout: (handle: any) => void;
}

export function createRingbackToneController(
  dependencies: RingbackToneControllerDependencies,
): RingbackToneController {
  let audioContext: RingbackAudioContextLike | null = null;
  let gainNode: RingbackGainNodeLike | null = null;
  let oscillators: RingbackOscillatorNodeLike[] = [];
  let timerId: any = null;
  let playing = false;
  let phase: "on" | "off" = "on";

  function clearScheduledTransition() {
    if (timerId !== null) {
      dependencies.clearTimeout(timerId);
      timerId = null;
    }
  }

  function disconnectNode(node: { disconnect(): void }) {
    try {
      node.disconnect();
    } catch {
      // Ignore cleanup failures.
    }
  }

  function scheduleNextPhase() {
    clearScheduledTransition();
    const delay = phase === "on" ? RINGBACK_ON_DURATION_MS : RINGBACK_OFF_DURATION_MS;
    timerId = dependencies.setTimeout(() => {
      if (!playing || !gainNode) {
        return;
      }

      phase = phase === "on" ? "off" : "on";
      updatePhase();
    }, delay);
  }

  function updatePhase() {
    if (!gainNode) {
      return;
    }

    gainNode.gain.value = phase === "on" ? RINGBACK_GAIN_LEVEL : 0;
    scheduleNextPhase();
  }

  function teardownAudio() {
    clearScheduledTransition();

    if (gainNode) {
      try {
        gainNode.gain.value = 0;
      } catch {
        // Ignore cleanup failures.
      }
    }

    oscillators.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch {
        // Ignore cleanup failures.
      }
      disconnectNode(oscillator);
    });

    if (gainNode) {
      disconnectNode(gainNode);
    }

    if (audioContext) {
      void Promise.resolve(audioContext.close()).catch(() => undefined);
    }

    audioContext = null;
    gainNode = null;
    oscillators = [];
    phase = "on";
  }

  return {
    start() {
      if (playing) {
        return;
      }

      const nextContext = dependencies.createAudioContext();
      if (!nextContext) {
        return;
      }

      audioContext = nextContext;
      try {
        gainNode = audioContext.createGain();
        gainNode.gain.value = 0;
        gainNode.connect(audioContext.destination);

        oscillators = RINGBACK_FREQUENCIES.map((frequency) => {
          const oscillator = audioContext?.createOscillator();
          if (!oscillator || !gainNode) {
            throw new Error("Unable to create ringback oscillator.");
          }

          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          oscillator.connect(gainNode);
          oscillator.start();
          return oscillator;
        });

        playing = true;
        phase = "on";
        updatePhase();
        void Promise.resolve(audioContext.resume()).catch(() => undefined);
      } catch {
        teardownAudio();
      }
    },
    stop() {
      if (!playing && !audioContext) {
        clearScheduledTransition();
        return;
      }

      playing = false;
      teardownAudio();
    },
    isPlaying() {
      return playing;
    },
  };
}
