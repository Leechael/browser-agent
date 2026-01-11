"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        className={cn(
          "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-base shadow-xs ring-ring/24 transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:text-sm",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";

export { Select };
