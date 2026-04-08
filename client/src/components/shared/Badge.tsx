import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-[10px] font-medium",
        className,
      )}
      {...props}
    />
  );
}
