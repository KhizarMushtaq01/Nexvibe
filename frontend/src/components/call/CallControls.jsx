import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiMessageCircle, FiVolume2, FiRefreshCw } from 'react-icons/fi';

function ControlButton({ label, active, danger, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center rounded-full transition-colors
        w-14 h-14 sm:w-14 sm:h-14 flex-shrink-0
        ${danger
          ? 'bg-red-500 hover:bg-red-600 text-white'
          : active
            ? 'bg-white text-neutral-900 hover:bg-white/90'
            : 'bg-white/15 text-white hover:bg-white/25'}`}
    >
      {children}
    </button>
  );
}

/**
 * The call's control bar. Capability-gated: buttons for things this browser
 * cannot do are not rendered at all, rather than shown and quietly ignored.
 */
export default function CallControls({
  localAudio, localVideo, onToggleAudio, onToggleVideo, onEnd, onMessage,
  canSetSpeaker, speakerOn, onToggleSpeaker,
  canFlipCamera, onFlipCamera,
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 px-4">
      <ControlButton label={localAudio ? 'Mute' : 'Unmute'} active={!localAudio} onClick={onToggleAudio}>
        {localAudio ? <FiMic className="w-6 h-6" /> : <FiMicOff className="w-6 h-6" />}
      </ControlButton>

      <ControlButton label={localVideo ? 'Turn camera off' : 'Turn camera on'} active={!localVideo} onClick={onToggleVideo}>
        {localVideo ? <FiVideo className="w-6 h-6" /> : <FiVideoOff className="w-6 h-6" />}
      </ControlButton>

      {canSetSpeaker && (
        <ControlButton label="Speaker" active={speakerOn} onClick={onToggleSpeaker}>
          <FiVolume2 className="w-6 h-6" />
        </ControlButton>
      )}

      {canFlipCamera && localVideo && (
        <ControlButton label="Flip camera" onClick={onFlipCamera}>
          <FiRefreshCw className="w-6 h-6" />
        </ControlButton>
      )}

      <ControlButton label="Message" onClick={onMessage}>
        <FiMessageCircle className="w-6 h-6" />
      </ControlButton>

      <ControlButton label="End call" danger onClick={onEnd}>
        <FiPhoneOff className="w-6 h-6" />
      </ControlButton>
    </div>
  );
}
