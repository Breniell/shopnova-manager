import { cn } from "@/lib/utils";

interface TactileCardProps {
  children: React.ReactNode;
  className?: string;
  level?: 0 | 1 | 2;
}

export const TactileCard = ({ children, className, level = 2 }: TactileCardProps) => {
  const levelClasses = {
    0: "bg-[#f9f9f8]",
    1: "surface-container-low",
    2: "surface-container-lowest",
  };

  return (
    <div className={cn("rounded-lg", levelClasses[level], className)}>
      {children}
    </div>
  );
};
