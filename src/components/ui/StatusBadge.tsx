import { cn } from "@/lib/utils";

export type StockStatus = "healthy" | "low" | "stockout";

interface StatusBadgeProps {
  status: StockStatus;
  className?: string;
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const variants: Record<StockStatus, string> = {
    healthy:  "badge-healthy",
    low:      "badge-low-stock",
    stockout: "badge-stockout",
  };

  const labels: Record<StockStatus, string> = {
    healthy:  "EN STOCK",
    low:      "STOCK FAIBLE",
    stockout: "RUPTURE",
  };

  return (
    <span className={cn(variants[status], className)}>
      {labels[status]}
    </span>
  );
};
