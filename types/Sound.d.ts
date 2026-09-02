export {};

declare global {
  type OpenDeskSoundPlaybackStatus =
    | "playing"
    | "paused"
    | "stopping"
    | "completed"
    | "stopped"
    | "failed";

  interface OpenDeskSoundPlaybackResult {
    id: string;
    path: string;
    status: "completed" | "stopped" | "failed";
    error?: string;
  }

  interface OpenDeskSoundPlayback {
    readonly id: string;
    readonly path: string;
    readonly startedAt: string;
    status(): OpenDeskSoundPlaybackStatus;
    isPlaying(): boolean;
    pause(): boolean;
    resume(): boolean;
    stop(): boolean;
    wait(): Promise<OpenDeskSoundPlaybackResult>;
  }

  interface OpenDeskSoundStartOptions {
    /** Repeat the file until stop() is called. Default: false. */
    loop?: boolean;
  }

  interface OpenDeskActiveSoundPlayback {
    id: string;
    path: string;
    status: OpenDeskSoundPlaybackStatus;
    loop: boolean;
    startedAt: string;
  }

  interface OpenDeskSound {
    playSuccess(): void;
    playFail(): void;
    playWarning(): void;
    playError(): void;
    playCaptcha(): void;
    playSound(soundPath: string): void;
    play(soundPath: string): void;
    /** Start without blocking the Runtime event loop. */
    start(soundPath: string, options?: OpenDeskSoundStartOptions): OpenDeskSoundPlayback;
    /** Alias for start(). */
    playAsync(soundPath: string, options?: OpenDeskSoundStartOptions): OpenDeskSoundPlayback;
    /** Request stop for a playback id; false means it is already terminal or unknown. */
    stop(id: string): boolean;
    /** Request stop for every active playback and return the number accepted. */
    stopAll(): number;
    getActive(): OpenDeskActiveSoundPlayback[];
  }

  var Sound: OpenDeskSound;
}
