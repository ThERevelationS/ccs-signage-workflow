// React shim for the O-008u verification harness.
//
// Bundled candidate files `import { useState } from "react"` — esbuild aliases
// that specifier HERE while everything else (react/jsx-runtime, react-dom)
// resolves to the real installed react. The shim forwards every hook to the
// real react module loaded via createRequire (so it shares the SAME
// ReactCurrentDispatcher that react-dom/server installs during
// renderToStaticMarkup), and adds ONE test affordance: a seed queue that
// supplies useState initial values in call order. That lets the harness
// render internal branches (loaded lists, an open edit form) that normally
// need entity loads + user events, without touching the component.
//
// Seed semantics: __seedReactStates([v0, v1, ...]) — each useState call pops
// the next seed and stores it verbatim (seeds are plain values, never
// initializer functions). Once the queue is empty, real initialization runs —
// which is exactly what we want for inner components whose init logic IS the
// thing under test (e.g. EquipmentForm's `useState(initial)`).

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const React = require("react");

const realUseState = React.useState;
let seedQueue = null;

export const __seedReactStates = (arr) => {
  seedQueue = Array.isArray(arr) ? [...arr] : null;
};

export const useState = (init) => {
  if (seedQueue && seedQueue.length) {
    return realUseState(seedQueue.shift());
  }
  return realUseState(init);
};

export const useEffect = React.useEffect;
export const useLayoutEffect = React.useLayoutEffect;
export const useMemo = React.useMemo;
export const useRef = React.useRef;
export const useCallback = React.useCallback;
export const useReducer = React.useReducer;
export const useContext = React.useContext;
export const useId = React.useId;
export const useImperativeHandle = React.useImperativeHandle;
export const useSyncExternalStore = React.useSyncExternalStore;
export const useTransition = React.useTransition;
export const useDeferredValue = React.useDeferredValue;
export const Fragment = React.Fragment;
export const StrictMode = React.StrictMode;
export const Suspense = React.Suspense;
export const Children = React.Children;
export const cloneElement = React.cloneElement;
export const createContext = React.createContext;
export const createElement = React.createElement;
export const createFactory = React.createFactory;
export const createRef = React.createRef;
export const forwardRef = React.forwardRef;
export const isValidElement = React.isValidElement;
export const lazy = React.lazy;
export const memo = React.memo;
export const startTransition = React.startTransition;
export const version = React.version;
export default React;
