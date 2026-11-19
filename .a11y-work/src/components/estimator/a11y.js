import { useEffect, useRef } from "react";

// Shared a11y helpers for the estimator UI sweep (#426-#450).
// Radix-based dialogs (src/components/ui/dialog.jsx) already provide focus
// trap, role="dialog", aria-modal, Escape close and focus return — these
// helpers cover the handful of hand-rolled fixed-overlay modals that do not
// use that primitive, plus small ergonomic utilities for icon-only buttons.

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Call `onEscape` when the Escape key is pressed while `active` is true.
 * Listens on document so it works regardless of which element has focus.
 */
export function useEscapeKey(active, onEscape) {
  const handlerRef = useRef(onEscape);
  handlerRef.current = onEscape;
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        handlerRef.current?.(event);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [active]);
}

/**
 * A11y for hand-rolled modal dialogs (non-Radix):
 *  - returns props to spread on the dialog container (role, aria-modal,
 *    aria-labelledby via a caller-provided title id) and a ref to attach.
 *  - moves focus into the dialog on open (first focusable element, or the
 *    container itself), traps Tab/Shift+Tab inside, and returns focus to the
 *    previously-focused element (usually the trigger) on close.
 *  - Escape handling is intentionally NOT included — pair with useEscapeKey
 *    so the caller controls the close callback.
 */
export function useModalDialog({ open, labelledBy }) {
  const containerRef = useRef(null);
  const restoreRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = containerRef.current;
    // Defer one frame so conditional content (autoFocus inputs, async lists)
    // has a chance to mount before we pick a focus target.
    const focusTimer = window.setTimeout(() => {
      if (!node) return;
      const explicit = node.querySelector("[autofocus], [data-autofocus]");
      const target = explicit || node.querySelector(FOCUSABLE_SELECTOR) || node;
      if (!explicit && node.hasAttribute("tabindex") === false) {
        node.setAttribute("tabindex", "-1");
      }
      target?.focus?.();
    }, 0);

    const onKeyDown = (event) => {
      if (event.key !== "Tab" || !node) return;
      const focusables = [...node.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (!focusables.length) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !node.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      const previous = restoreRef.current;
      restoreRef.current = null;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open]);

  const dialogProps = {
    role: "dialog",
    "aria-modal": "true",
    ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
  };

  return { containerRef, dialogProps };
}

/**
 * Spread-friendly props for icon-only <button> actions: guarantees an
 * accessible name (aria-label) plus the hover tooltip (#426/#444). The
 * visible content is assumed to be a decorative lucide icon.
 */
export function iconOnlyProps(label, extra = {}) {
  return { "aria-label": label, title: label, ...extra };
}

/**
 * Props for decorative icons inside labeled controls (#434/#446).
 */
export const decorativeIconProps = { "aria-hidden": "true" };
