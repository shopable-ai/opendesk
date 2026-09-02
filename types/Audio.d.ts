export {};

declare global {
  interface OpenDeskAudioControlCapability {
    read: boolean;
    write: boolean;
  }

  interface OpenDeskAudioVolumeCapability extends OpenDeskAudioControlCapability {
    unit: "scalar";
    minimum: 0;
    maximum: 1;
  }

  interface OpenDeskAudioDevice {
    id: number;
    /** Persistent platform identifier. Do not write user-named device metadata to public evidence. */
    uid: string;
    name: string;
    manufacturer: string;
    /** Platform transport identifier; CoreAudio currently reports a four-character code. */
    transport: string;
    inputChannels: number;
    outputChannels: number;
    alive: boolean;
    defaultInput: boolean;
    defaultOutput: boolean;
    volume: OpenDeskAudioControlCapability;
    mute: OpenDeskAudioControlCapability;
  }

  interface OpenDeskAudioCaptureCapability {
    supported: false;
    status: "notImplemented";
    permission: "microphone" | "screenRecording";
    reason: string;
  }

  interface OpenDeskAudioCapabilities {
    schemaVersion: 1;
    platform: string;
    backend: "coreaudio" | "unavailable" | string;
    controls: {
      volume: OpenDeskAudioVolumeCapability;
      mute: OpenDeskAudioControlCapability;
    };
    devices: {
      input: boolean;
      output: boolean;
      defaultInput: boolean;
      defaultOutput: boolean;
      setDefaultOutput: false;
    };
    capture: {
      microphone: OpenDeskAudioCaptureCapability;
      systemAudio: OpenDeskAudioCaptureCapability;
    };
    playback: {
      namespace: "Sound";
      /** Legacy play* / playSound / play methods block until completion. */
      blocking: true;
      /** start() and playAsync() return without blocking the Runtime event loop. */
      nonBlocking: true;
      controllable: true;
      formats: string[];
    };
    notes: string;
  }

  interface OpenDeskAudio {
    /** Default output scalar in the inclusive 0..1 range. */
    getVolume(): number;
    /** Sets the default output scalar and returns the hardware readback. */
    setVolume(value: number): number;
    isMuted(): boolean;
    /** Returns the hardware mute readback. */
    mute(): boolean;
    /** Returns the hardware mute readback. */
    unmute(): boolean;
    /** Returns the new hardware mute state. */
    toggleMute(): boolean;
    getOutputDevices(): OpenDeskAudioDevice[];
    getInputDevices(): OpenDeskAudioDevice[];
    getDefaultOutput(): OpenDeskAudioDevice | null;
    getDefaultInput(): OpenDeskAudioDevice | null;
    getCapabilities(): OpenDeskAudioCapabilities;
  }

  var Audio: OpenDeskAudio;
}
