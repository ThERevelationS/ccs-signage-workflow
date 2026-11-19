// Fixture stub mirroring the app's shadcn-style Input: forwardRef passthrough.
import React from "react";

export const Input = React.forwardRef(function Input(props, ref) {
  return React.createElement("input", { ...props, ref });
});
export default Input;
