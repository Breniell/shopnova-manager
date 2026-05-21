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

  if (mode === "credit") {
    return (
      <span className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider",
        "bg-red-500/15 text-red-400 border border-red-500/30",
        className
      )}>
        Crédit
      </span>
    );
  }

  return <span className={cn("badge-cash", className)}>{mode.toUpperCase()}</span>;
};
