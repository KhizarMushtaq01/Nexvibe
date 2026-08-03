export default function PostSkeleton() {
  return (
    <div className="bg-[var(--bg-primary)] border-b border-[var(--border)] lg:border lg:rounded-xl lg:mb-6">
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="w-9 h-9 rounded-full shimmer flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 w-28 rounded shimmer" />
          <div className="h-2 w-20 rounded shimmer" />
        </div>
      </div>
      <div className="w-full aspect-square shimmer" />
      <div className="px-3 py-3 space-y-2.5">
        <div className="flex gap-3">
          {[0,1,2].map(i => <div key={i} className="w-7 h-7 rounded shimmer" />)}
        </div>
        <div className="h-2.5 w-24 rounded shimmer" />
        <div className="h-2.5 w-full rounded shimmer" />
        <div className="h-2.5 w-3/4 rounded shimmer" />
        <div className="h-2 w-16 rounded shimmer" />
      </div>
    </div>
  );
}
