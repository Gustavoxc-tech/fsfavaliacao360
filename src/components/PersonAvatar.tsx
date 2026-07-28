import { cn } from "@/lib/utils";

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const sizeMap = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl",
};

export function PersonAvatar({
  name,
  url,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  url?: string | null;
  size?: keyof typeof sizeMap;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-full overflow-hidden bg-primary text-primary-foreground grid place-items-center font-semibold shrink-0 ring-2 ring-background shadow-sm",
        sizeMap[size],
        className,
      )}
      aria-label={name ?? "avatar"}
    >
      {url ? (
        <img
          src={url}
          alt={name ?? ""}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}
