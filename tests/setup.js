const store = {};
const listeners = {};
const shared = [];
const fakeQuery = {};
const elements = {};
const fakeAll = {};
const fakeView = { innerHTML: '', addEventListener: (t, f) => (listeners[t] = f), querySelector: sel => fakeQuery[sel] ?? null };

globalThis.window = globalThis;
globalThis.innerWidth = 390;
globalThis.location = { hash: '' };
globalThis.addEventListener = () => {};
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
globalThis.document = {
  getElementById: id => (id === 'view' ? fakeView : (elements[id] ||= { innerHTML: '' })),
  documentElement: { style: { setProperty() {} } },
  querySelectorAll: sel => fakeAll[sel] ?? [],
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
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
globalThis.prompt = () => 'Renamed';
globalThis.confirm = () => true;
