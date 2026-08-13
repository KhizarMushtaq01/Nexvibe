import { useEffect, useRef } from 'react';
import { FiMicOff } from 'react-icons/fi';
import Avatar from '../common/Avatar';

/**
 * One participant in the call. Renders their video when they have one, and
 * their avatar when they don't -- an audio call is just the avatar case.
 */
export default function ParticipantTile({ peer, stream, isLocal = false, mirrored = false, compact = false }) {
  const videoRef = useRef(null);
  const hasVideo = !!stream?.getVideoTracks?.().some(t => t.enabled && t.readyState === 'live');

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  const name = peer?.user?.username || peer?.user?.fullName || (isLocal ? 'You' : '');

  return (
    <div className="relative w-full h-full bg-neutral-900 rounded-2xl overflow-hidden flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${hasVideo ? '' : 'hidden'} ${mirrored ? 'scale-x-[-1]' : ''}`}
      />

      {!hasVideo && (
        <div className="flex flex-col items-center gap-2">
          <div className={peer?.speaking ? 'ring-4 ring-green-400 rounded-full transition-all' : ''}>
            <Avatar src={peer?.user?.avatar} size={compact ? 48 : 88} alt={name} />
          </div>
          {!compact && <p className="text-white/90 text-sm font-medium truncate max-w-[90%]">{name}</p>}
        </div>
      )}

      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 pointer-events-none">
        {hasVideo && (
          <span className="text-white text-xs font-medium bg-black/50 px-2 py-0.5 rounded-full truncate max-w-[70%]">
            {name}
          </span>
        )}
        {peer?.audioEnabled === false && (
          <span className="bg-red-500 rounded-full p-1"><FiMicOff className="w-3 h-3 text-white" /></span>
        )}
      </div>
    </div>
  );
}
