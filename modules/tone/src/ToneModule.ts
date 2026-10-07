import { NativeModule, requireNativeModule } from 'expo';

/** One part of what is played: a sine at hz, or silence at 0, for ms. */
export type Segment = { hz: number; ms: number };

declare class ToneModule extends NativeModule<{}> {
  /**
   * Plays the segments in order and resolves once the last has been heard
   * out, or once stop() cut it short — with true if it played to the end.
   * usage is what the platform is told the sound is for; only Android
   * keeps it ("media" or "alarm").
   */
  playAsync(segments: Segment[], usage: string): Promise<boolean>;
  /** Stops whatever is playing. Nothing playing is not an error. */
  stop(): void;
}

export default requireNativeModule<ToneModule>('Tone');
