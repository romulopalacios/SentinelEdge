import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:     "border-transparent bg-primary/20 text-primary",
        secondary:   "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive/20 text-destructive",
        outline:     "border-border text-foreground",
        critical:    "border-sev-critical/20 bg-sev-critical/10 text-sev-critical",
        high:        "border-sev-high/20 bg-sev-high/10 text-sev-high",
        medium:      "border-sev-medium/20 bg-sev-medium/10 text-sev-medium",
        low:         "border-sev-low/20 bg-sev-low/10 text-sev-low",
        online:      "border-status-online/20 bg-status-online/10 text-status-online",
        offline:     "border-status-offline/20 bg-status-offline/10 text-status-offline",
        warning:     "border-status-warning/20 bg-status-warning/10 text-status-warning",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
