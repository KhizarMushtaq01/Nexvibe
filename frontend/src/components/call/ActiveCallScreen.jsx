import { useMemo } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import Avatar from '../common/Avatar';
import ParticipantTile from './ParticipantTile';
import CallControls from './CallControls';
import { useCallDuration } from '../../hooks/useCallDuration';
import { useCall } from '../../context/CallContext';
import { useCallInsights } from '../../hooks/useCallInsights';

const gridClassFor = (count) => {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2';
  if (count <= 4) return 'grid-cols-2';
  return 'grid-cols-2 lg:grid-cols-3';
};

const QUALITY_DOT = {
  good: 'bg-green-400', fair: 'bg-amber-400', poor: 'bg-red-500', unknown: 'bg-white/30',
};

export default function ActiveCallScreen({
  call, localStream, remoteStreams,
  onToggleAudio, onToggleVideo, onEnd, onMessage, onMinimize,
  canSetSpeaker, speakerOn, onToggleSpeaker, canFlipCamera, onFlipCamera,
}) {
  const duration = useCallDuration(call.startedAt);
  const peerList = useMemo(() => Object.values(call.peers), [call.peers]);
  const primary = peerList[0];

  const { peerConnections } = useCall();
  const { quality, speakingIds } = useCallInsights(
    peerConnections, remoteStreams, call.status === 'active'
  );

  const statusLine = call.status === 'outgoing'
    ? 'Ringing…'
    : call.status === 'connecting'
      ? 'Connecting…'
      : call.status === 'ended'
        ? (call.error || 'Call ended')
        : duration || 'Connected';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-b from-neutral-900 via-neutral-900 to-black">
      {/* Header: the other caller's profile image, name and live timer */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0">
        <button
          onClick={onMinimize}
          aria-label="Minimize call"
          className="p-2 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <FiChevronDown className="w-5 h-5 text-white" />
        </button>

        {call.isGroup ? (
          <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0">
            {peerList.map(p => (
              <Avatar key={p.userId} src={p.user?.avatar} size={36} alt={p.user?.username} />
            ))}
          </div>
        ) : (
          <Avatar src={primary?.user?.avatar} size={44} alt={primary?.user?.username} />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-white font-semibold text-sm truncate">
            {call.isGroup
              ? `${peerList.length + 1} people`
              : primary?.user?.username || primary?.user?.fullName || 'Call'}
          </p>
          <p className="text-white/60 text-xs tabular-nums flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${QUALITY_DOT[quality]}`}
                  title={`Connection: ${quality}`} />
            {statusLine}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 px-3 pb-3">
        {call.isGroup ? (
          <div className={`grid ${gridClassFor(peerList.length + 1)} gap-2 h-full auto-rows-fr overflow-y-auto`}>
            {peerList.map(p => (
              <ParticipantTile key={p.userId} peer={{ ...p, speaking: speakingIds.has(p.userId) }}
                stream={remoteStreams.get(p.userId)} compact />
            ))}
            <ParticipantTile peer={{ user: { username: 'You' } }} stream={localStream} isLocal mirrored compact />
          </div>
        ) : (
          <div className="relative w-full h-full">
            <ParticipantTile peer={{ ...primary, speaking: speakingIds.has(primary?.userId) }}
              stream={remoteStreams.get(primary?.userId)} />
            {call.localVideo && (
              <div className="absolute bottom-4 right-4 w-24 h-36 sm:w-32 sm:h-48 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20">
                <ParticipantTile peer={{ user: { username: 'You' } }} stream={localStream} isLocal mirrored compact />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <CallControls
          localAudio={call.localAudio}
          localVideo={call.localVideo}
          onToggleAudio={onToggleAudio}
          onToggleVideo={onToggleVideo}
          onEnd={onEnd}
          onMessage={onMessage}
          canSetSpeaker={canSetSpeaker}
          speakerOn={speakerOn}
          onToggleSpeaker={onToggleSpeaker}
          canFlipCamera={canFlipCamera}
          onFlipCamera={onFlipCamera}
        />
      </div>
    </div>
  );
}
