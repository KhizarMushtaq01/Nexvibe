import { FiPhoneOff } from 'react-icons/fi';
import Avatar from '../common/Avatar';
import { useCallDuration } from '../../hooks/useCallDuration';

export default function MinimizedCallPill({ call, onRestore, onEnd }) {
  const duration = useCallDuration(call.startedAt);
  const primary = Object.values(call.peers)[0];

  return (
    <div className="fixed z-[95] bottom-20 lg:bottom-6 right-4 flex items-center gap-3
                    bg-neutral-900 text-white rounded-full pl-2 pr-2 py-2 shadow-2xl ring-1 ring-white/10">
      <button onClick={onRestore} className="flex items-center gap-2 pr-1" aria-label="Return to call">
        <Avatar src={primary?.user?.avatar} size={32} alt={primary?.user?.username} />
        <div className="text-left">
          <p className="text-xs font-semibold leading-tight truncate max-w-[100px]">
            {primary?.user?.username || 'Call'}
          </p>
          <p className="text-[11px] text-white/60 tabular-nums leading-tight">
            {duration || 'Connecting…'}
          </p>
        </div>
      </button>
      <button
        onClick={onEnd}
        aria-label="End call"
        className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
      >
        <FiPhoneOff className="w-4 h-4" />
      </button>
    </div>
  );
}
