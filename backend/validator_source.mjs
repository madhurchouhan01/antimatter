// Mock DOM
globalThis.window = {
  scrollX: 0,
  scrollY: 0,
  location: { href: "" },
  navigator: { userAgent: "mermaid-validator" },
  addEventListener: () => {},
  removeEventListener: () => {},
  getComputedStyle: () => ({
    getPropertyValue: () => ""
  })
};
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  getElementsByClassName: () => [],
  getElementsByTagName: () => [],
  createElement: () => ({
    tagName: "div",
    style: {},
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    removeChild: () => {},
    getBoundingClientRect: () => ({
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 100,
      height: 20,
      x: 0,
      y: 0
    }),
    innerHTML: "",
    textContent: "",
    childNodes: [],
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false
    }
  }),
  createElementNS: () => ({
    setAttribute: () => {},
    getAttribute: () => null,
    getBBox: () => ({ x: 0, y: 0, width: 100, height: 20 })
  }),
  createTextNode: () => ({}),
  body: { appendChild: () => {}, style: {} }
};
if (typeof Element === "undefined") {
  globalThis.Element = class Element {
    setAttribute() {}
    getAttribute() { return null; }
    removeAttribute() {}
  };
}

import DOMPurify from 'dompurify';
if (DOMPurify) {
  DOMPurify.addHook = () => {};
  DOMPurify.sanitize = (x) => x;
}

import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false });

import fs from 'fs';

async function run() {
  try {
    const code = fs.readFileSync(0, 'utf-8');
    await mermaid.parse(code);
    console.log(JSON.stringify({ valid: true }));
  } catch (err) {
    console.log(JSON.stringify({ valid: false, error: err.message || String(err) }));
  }
}
run();
