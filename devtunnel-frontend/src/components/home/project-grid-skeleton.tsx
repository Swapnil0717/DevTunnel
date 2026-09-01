export function ProjectGridSkeleton({ count }: { count: number }) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" aria-hidden="true">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="h-[86px] rounded-lg bg-surface animate-pulse" />
        ))}
      </div>
    );
  }