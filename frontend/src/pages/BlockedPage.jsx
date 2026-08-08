import { FiGlobe } from 'react-icons/fi';

export default function BlockedPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center p-3 sm:p-4">
      <div className="card p-6 sm:p-8 w-full max-w-[380px] text-center animate-fade-in">
        <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-full bg-pink-500/10 flex items-center justify-center">
          <FiGlobe className="w-7 h-7 sm:w-8 sm:h-8 text-pink-500" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold mb-2">Not available in your region</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          This service isn't available where you're currently located.
        </p>
      </div>
    </div>
  );
}
