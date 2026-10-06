import { requireOptionalNativeModule } from 'expo';

// Mobium's gray box, in the app. The native module writes the app's busy
// state to the device log when the app was launched with the gray box on,
// and does nothing otherwise. A no-op where the native module is absent.
//
// Hooks are the way in: register a function by name, and a test calls it
// with `mobium hook <name> [args...]` or any client's hook(), getting back
// what it returns. Calls arrive only in a gray-box launch. A hook in a
// shipped build would be a back door, so register hooks only in builds made
// for testing.
type Call = { id: string; hook: string; args: (string | null)[] };
type Native = {
  busy(tag: string): void;
  idle(tag: string): void;
  answer(id: string, ok: boolean, payload: string): void;
  addListener(event: 'onHook', listener: (call: Call) => void): { remove(): void };
};
const native = requireOptionalNativeModule<Native>('GrayBox');

type Hook = (...args: (string | null)[]) => unknown | Promise<unknown>;
const hooks = new Map<string, Hook>();

// A hook's work is work like any other: busy while it runs, and idle only
// two frames after it answers, once what it changed is on screen — or the
// test's next tap lands on the screen the hook is replacing.
async function handle(call: Call) {
  const tag = `hook:${call.hook}`;
  native?.busy(tag);
  const done = () => requestAnimationFrame(() => requestAnimationFrame(() => native?.idle(tag)));
  const hook = hooks.get(call.hook);
  if (!hook) {
    const known = [...hooks.keys()].sort().join(', ') || 'none';
    native?.answer(call.id, false, `no hook named ${call.hook}; registered: ${known}`);
    done();
    return;
  }
  try {
    const result = await hook(...call.args);
    native?.answer(call.id, true, JSON.stringify(result ?? null));
  } catch (e) {
    native?.answer(call.id, false, e instanceof Error ? e.message : String(e));
  }
  done();
}

native?.addListener('onHook', (call) => { void handle(call); });

export default {
  busy: (tag: string) => native?.busy(tag),
  idle: (tag: string) => native?.idle(tag),
  /** Registers a hook a test can call by name; registering a name again replaces it. */
  register: (name: string, hook: Hook) => { hooks.set(name, hook); },
};
