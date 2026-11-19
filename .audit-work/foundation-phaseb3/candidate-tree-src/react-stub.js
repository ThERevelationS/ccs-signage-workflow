export const useMemo = (fn) => fn();
export const useState = (v) => [v, () => {}];
export const useRef = (v) => ({ current: v });
export const useEffect = () => {};
export const useCallback = (fn) => fn;
export const useContext = () => ({});
export const Fragment = Symbol("Fragment");
export default { useMemo, useState, useRef, useEffect, useCallback, useContext, Fragment };
