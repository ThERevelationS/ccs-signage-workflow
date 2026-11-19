// Fixture stub for lucide-react — named icons render as inert svg placeholders.
import React from "react";

const icon = (name) =>
  function Icon(props) {
    return React.createElement("svg", {
      "data-icon": name,
      "aria-hidden": "true",
      width: 14,
      height: 14,
      className: props?.className,
    });
  };

export const Plus = icon("plus");
export const Trash2 = icon("trash2");
export const PenLine = icon("penline");
export const Undo2 = icon("undo2");
export const Square = icon("square");
