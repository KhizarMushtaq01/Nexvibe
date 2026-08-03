export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-[var(--bg-primary)] flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-4">
        <div className="text-4xl font-black text-gradient animate-pulse">✦</div>
        <div className="w-8 h-8 border-2 border-[var(--border)] border-t-pink-500 rounded-full animate-spin" />
      </div>
    </div>
  );
}
