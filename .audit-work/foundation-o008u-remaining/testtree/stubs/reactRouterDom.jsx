// react-router-dom stub — Link renders a plain anchor.
import React from "react";
export const Link = ({ to, children, ...props }) =>
  React.createElement("a", { href: to, ...props }, children);
export const useNavigate = () => () => {};
export const useLocation = () => ({ pathname: "/", search: "" });
