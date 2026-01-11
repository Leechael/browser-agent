"use client";

import { Input as InputPrimitive } from "@base-ui-components/react/input";
import type * as React from "react";

import { cn } from "@/lib/utils";

type InputProps = Omit<
  InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
  "size"
> & {
  size?: "sm" | "default" | "lg" | number;
};

function Input({
  className,
  size = "default",
  ...props
}: InputProps) {
  return (
    <span
      className={cn(
        "relative inline-flex w-full rounded-lg border border-input bg-background text-base shadow-xs ring-ring/24 transition-shadow has-[:focus-visible]:border-ring has-[:focus-visible]:ring-2 has-[:disabled]:opacity-64 sm:text-sm",
        className
      )}
      data-size={size}
      data-slot="input-control"
    >
      <InputPrimitive
        className={cn(
          "h-9 w-full min-w-0 rounded-[inherit] bg-transparent px-3 outline-none placeholder:text-muted-foreground sm:h-8",
          size === "sm" && "h-8 px-2.5 sm:h-7",
          size === "lg" && "h-10 sm:h-9"
        )}
        data-slot="input"
        size={typeof size === "number" ? size : undefined}
        {...props}
      />
    </span>
  );
}

export { Input, type InputProps };
