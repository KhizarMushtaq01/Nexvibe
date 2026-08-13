import { FiPhone, FiPhoneOff, FiVideo, FiMic } from 'react-icons/fi';
import Avatar from '../common/Avatar';

export default function IncomingCallScreen({ call, onAnswer, onDecline }) {
  const caller = call.caller || {};
  const otherNames = Object.values(call.peers)
    .map(p => p.user?.username)
    .filter(Boolean);
  const subtitle = call.isGroup
    ? `${otherNames.slice(0, 2).join(', ')}${otherNames.length > 2 ? ` +${otherNames.length - 2}` : ''}`
    : null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between
                    bg-gradient-to-b from-neutral-900 via-neutral-900 to-black
                    px-6 pt-16 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center gap-4 mt-8 sm:mt-16 text-center">
        <Avatar src={caller.avatar} size={128} alt={caller.fullName || caller.username} />
        <div>
          <h2 className="text-white text-2xl font-bold">{caller.username || caller.fullName || 'Unknown'}</h2>
          {subtitle && <p className="text-white/60 text-sm mt-1">{subtitle}</p>}
          <p className="text-white/70 text-sm mt-2 animate-pulse">
            Incoming {call.callType === 'video' ? 'video' : 'voice'} call…
          </p>
        </div>
      </div>

      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        {call.callType === 'video' && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => onAnswer({ withVideo: false })}
              className="flex items-center gap-2 text-white/80 text-sm px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <FiMic className="w-4 h-4" /> Answer as audio
            </button>
            <button
              onClick={() => onAnswer({ withVideo: true })}
              className="flex items-center gap-2 text-white/80 text-sm px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <FiVideo className="w-4 h-4" /> With video
            </button>
          </div>
        )}

        <div className="w-full flex items-center justify-around">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onDecline}
              aria-label="Decline call"
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
            >
              <FiPhoneOff className="w-7 h-7 text-white" />
            </button>
            <span className="text-white/60 text-xs">Decline</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => onAnswer({ withVideo: call.callType === 'video' })}
              aria-label="Answer call"
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors animate-bounce-slow"
            >
              <FiPhone className="w-7 h-7 text-white" />
            </button>
            <span className="text-white/60 text-xs">Answer</span>
          </div>
        </div>
      </div>
    </div>
  );
}
