// Fixture stub mirroring the app's Button: passthrough <button>.
import React from "react";

export const Button = React.forwardRef(function Button({ variant, size, ...props }, ref) {
  return React.createElement("button", {
    ...props,
    ref,
    "data-variant": variant,
    "data-size": size,
  });
});
export default Button;
