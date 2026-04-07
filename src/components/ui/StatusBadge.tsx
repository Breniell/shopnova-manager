import { cn } from "@/lib/utils";

export type StockStatus = "healthy" | "low" | "critical" | "stockout";

interface StatusBadgeProps {
  status: StockStatus;
  className?: string;
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const variants = {
    healthy: "badge-healthy",
    low: "badge-low-stock",
    critical: "badge-low-stock",
    stockout: "badge-stockout",
  };

  const labels = {
    healthy: "EN STOCK",
    low: "STOCK FAIBLE",
    critical: "CRITIQUE",
    stockout: "RUPTURE",
  };

  return (
    <span className={cn(variants[status], className)}>
      {labels[status]}
    </span>
  );
};
