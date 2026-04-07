import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: "healthy" | "warning" | "danger";
  className?: string;
  showLabel?: boolean;
}

export const ProgressBar = ({ 
  value, 
  max = 100, 
  variant = "healthy",
  className,
  showLabel = false 
}: ProgressBarProps) => {
  const percentage = Math.min((value / max) * 100, 100);
  const fillClass = variant === "healthy" ? "bg-secondary-500" : "bg-primary-500";

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs mb-1">
          <span>{value}/{max}</span>
          <span>{percentage.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-2 rounded-full overflow-hidden bg-gray-200">
        <div 
          className={cn(fillClass, "h-full rounded-full transition-all")}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
