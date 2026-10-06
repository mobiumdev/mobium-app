import { requireOptionalNativeModule } from 'expo';

// The app's busy state, for Mobium's gray box: the native module writes it
// to the device log when the app was launched with the gray box on, and
// does nothing otherwise. A no-op where the native module is absent.
type Native = { busy(tag: string): void; idle(tag: string): void };
const native = requireOptionalNativeModule<Native>('GrayBox');

export default {
  busy: (tag: string) => native?.busy(tag),
  idle: (tag: string) => native?.idle(tag),
};
