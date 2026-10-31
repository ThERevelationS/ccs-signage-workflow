import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// Right-side sheet for quick edits -- the consistent-width drawer so pages
// stop hand-rolling SheetContent layout (header / scrollable body / footer).
//
//   <DetailDrawer open={!!editing} onOpenChange={(v) => !v && setEditing(null)}
//                 title={po.po_number} description={po.vendor_name}
//                 footer={<Button onClick={save}>Save</Button>}>
//     ...form fields...
//   </DetailDrawer>
const WIDTHS = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

const DetailDrawer = React.forwardRef(
  (
    {
      open,
      onOpenChange,
      title,
      description,
      footer,
      width = "md",
      className,
      bodyClassName,
      children,
      ...props
    },
    ref
  ) => (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={ref}
        side="right"
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          WIDTHS[width] || WIDTHS.md,
          className
        )}
        {...(description ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        {title || description ? (
          <SheetHeader className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            {title && <SheetTitle>{title}</SheetTitle>}
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
        ) : (
          // Radix requires a Title for screen readers even when the design
          // shows no header -- keep an invisible one so no warning fires.
          <SheetTitle className="sr-only">Details</SheetTitle>
        )}
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
);
DetailDrawer.displayName = "DetailDrawer";

export { DetailDrawer };
