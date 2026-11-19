// Minimal @/components/ui/* stubs for the O-008u harness — plain elements that
// forward the props the components actually set so renderToStaticMarkup emits
// inspectable markup (value/type/onChange/className/disabled/children...).
import React from "react";

const passthrough = (tag) => ({ children, ...props }) =>
  React.createElement(tag, props, children);

export const Card = passthrough("div");
export const CardContent = passthrough("div");
export const CardHeader = passthrough("div");
export const CardTitle = passthrough("div");

export const Button = ({ children, size, variant, ...props }) =>
  React.createElement("button", { type: "button", ...props }, children);

export const Badge = passthrough("span");

export const Switch = ({ checked, onCheckedChange, disabled }) =>
  React.createElement("button", {
    type: "button",
    role: "switch",
    "aria-checked": checked ? "true" : "false",
    disabled,
  });

export const Tabs = passthrough("div");
export const TabsContent = passthrough("div");
export const TabsList = passthrough("div");
export const TabsTrigger = passthrough("button");

export const Dialog = passthrough("div");
export const DialogContent = passthrough("div");
export const DialogHeader = passthrough("div");
export const DialogTitle = passthrough("div");

export const Input = ({ className, ...props }) =>
  React.createElement("input", { className, ...props });

export const Label = passthrough("label");

export const Checkbox = ({ checked, onCheckedChange, id }) =>
  React.createElement("input", { type: "checkbox", checked: !!checked, readOnly: true, id });

export const Select = passthrough("div");
export const SelectContent = passthrough("div");
export const SelectItem = ({ children, value }) =>
  React.createElement("option", { value }, children);
export const SelectTrigger = passthrough("div");
export const SelectValue = passthrough("span");

export const ListSkeleton = () => React.createElement("div", { "data-skeleton": "list" });
export const TableSkeleton = () => React.createElement("div", { "data-skeleton": "table" });
