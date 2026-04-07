import { cn } from "@/lib/utils";

export type PaymentMode = "especes" | "mobile_money" | "card" | "credit";

interface PaymentBadgeProps {
  mode: PaymentMode;
  operator?: "mtn" | "orange" | "moov";
  className?: string;
}

export const PaymentBadge = ({ mode, operator, className }: PaymentBadgeProps) => {
  if (mode === "especes") {
    return <span className={cn("badge-cash", className)}>CASH</span>;
  }

  if (mode === "mobile_money") {
    const operatorLabel = operator ? operator.toUpperCase() : "MOMO";
    return <span className={cn("badge-momo", className)}>{operatorLabel}</span>;
  }

  return <span className={cn("badge-cash", className)}>{mode.toUpperCase()}</span>;
};
