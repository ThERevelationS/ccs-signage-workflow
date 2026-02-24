/**
 * MobileSelect — on mobile renders a bottom-sheet (Drawer) picker,
 * on desktop falls back to the standard shadcn Select.
 */
import React, { useState, useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

const useIsMobile = () => {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return mobile;
};

/**
 * Props:
 *  value, onValueChange, placeholder, triggerClassName, children (SelectItem nodes)
 *  title — optional label shown in the drawer header
 */
export default function MobileSelect({
  value,
  onValueChange,
  placeholder = "Select…",
  triggerClassName = "",
  title = "Select an option",
  children,
}) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Collect options from children (SelectItem elements)
  const options = React.Children.toArray(children)
    .filter((c) => c?.props?.value !== undefined)
    .map((c) => ({
      value: c.props.value,
      label: c.props.children,
      disabled: c.props.disabled,
    }));

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  if (!isMobile) {
    // Desktop: standard select
    return (
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    );
  }

  return (
    <>
      {/* Custom trigger button */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className={`flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ${triggerClassName}`}
        style={{ minHeight: 44 }}
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {selectedLabel}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="pb-safe px-4 pb-6 space-y-1 overflow-y-auto max-h-[60vh]">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                onClick={() => {
                  onValueChange?.(opt.value);
                  setDrawerOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  opt.value === value
                    ? "bg-purple-100 text-purple-800"
                    : "hover:bg-gray-100 text-gray-800"
                } disabled:opacity-40`}
                style={{ minHeight: 44 }}
              >
                <span>{opt.label}</span>
                {opt.value === value && <Check className="w-4 h-4 text-purple-600" />}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}