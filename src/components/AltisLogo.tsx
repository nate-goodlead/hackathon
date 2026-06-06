import { cn } from "@/lib/utils";

interface AltisLogoProps {
  className?: string;
  size?: number;
}

export function AltisLogo({ className, size = 44 }: AltisLogoProps) {
  return (
    <img
      src="/altis-logo.svg"
      alt="Altis Groep"
      width={size}
      height={size}
      className={cn("rounded-full object-cover", className)}
    />
  );
}
