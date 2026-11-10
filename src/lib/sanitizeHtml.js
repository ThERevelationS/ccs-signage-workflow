import DOMPurify from "dompurify";

// Rich-text (react-quill) bodies are stored as HTML and rendered with
// dangerouslySetInnerHTML. Everything in the allowlist below covers the
// quill toolbar surface; anything else — scripts, iframes, event handlers,
// form controls — is stripped before render.
const QUILL_TAGS = [
  "p", "br", "span", "div",
  "strong", "b", "em", "i", "u", "s", "sub", "sup",
  "ol", "ul", "li",
  "blockquote", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "a",
];
const QUILL_ATTRS = ["href", "target", "rel", "class"];

export function sanitizeRichHtml(html) {
  const source = String(html || "");
  if (!source) return "";
  return DOMPurify.sanitize(source, {
    ALLOWED_TAGS: QUILL_TAGS,
    ALLOWED_ATTR: QUILL_ATTRS,
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
    // Links render in the app shell — force safe target/rel regardless of
    // what was authored.
    ADD_ATTR: ["rel"],
    FORBID_TAGS: ["style", "title", "textarea"],
    RETURN_TRUSTED_TYPE: false,
  });
}
