const store = {};
const listeners = {};
const shared = [];
const fakeView = { innerHTML: '', addEventListener: (t, f) => (listeners[t] = f), querySelector: () => null };

globalThis.window = globalThis;
globalThis.innerWidth = 390;
globalThis.location = { hash: '' };
globalThis.addEventListener = () => {};
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
globalThis.document = {
  getElementById: () => fakeView,
  documentElement: { style: { setProperty() {} } },
  querySelectorAll: () => [],
  addEventListener() {},
};
globalThis.navigator = { canShare: () => true, share: data => shared.push(data) };
globalThis.File = class {
  constructor(parts, name, opts) {
    this.text = parts.join('');
    this.name = name;
    this.type = opts.type;
  }
};
globalThis.prompt = () => 'Renamed';
globalThis.confirm = () => true;
