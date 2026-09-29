import { NativeModule, requireNativeModule } from 'expo';

declare class DownloadsModule extends NativeModule<{}> {
  /** Saves text as a file where the device keeps downloads, and says where. */
  saveAsync(name: string, text: string): Promise<string>;
  /** The name a picked file has where the person saw it, from its URI. */
  nameAsync(uri: string): Promise<string>;
}

export default requireNativeModule<DownloadsModule>('Downloads');
