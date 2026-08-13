import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useCall } from '../../context/CallContext';
import IncomingCallScreen from './IncomingCallScreen';
import ActiveCallScreen from './ActiveCallScreen';
import MinimizedCallPill from './MinimizedCallPill';

/**
 * The single mount point for all call UI. It stays mounted for the whole
 * call -- minimizing only changes what it renders, never unmounting the
 * <video> elements, which is what keeps the media flowing.
 */
export default function CallOverlay() {
  const {
    call, localStream, remoteStreams,
    answer, decline, endCall, toggleAudio, toggleVideo,
    setMinimized, openChat, canFlipCamera, flipCamera, canSetSpeaker,
  } = useCall();
  const [speakerOn, setSpeakerOn] = useState(false);

  if (call.status === 'idle') return null;

  const toggleSpeaker = async () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    // 'default' is the system default output; '' asks for the communications
    // device where the browser distinguishes them.
    for (const el of document.querySelectorAll('video, audio')) {
      try { await el.setSinkId?.(next ? 'default' : ''); } catch { /* not permitted */ }
    }
  };

  const content = call.status === 'incoming'
    ? <IncomingCallScreen call={call} onAnswer={answer} onDecline={decline} />
    : call.minimized
      ? <MinimizedCallPill call={call} onRestore={() => setMinimized(false)} onEnd={endCall} />
      : (
        <ActiveCallScreen
          call={call}
          localStream={localStream}
          remoteStreams={remoteStreams}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onEnd={endCall}
          onMessage={openChat}
          onMinimize={() => setMinimized(true)}
          canSetSpeaker={canSetSpeaker}
          speakerOn={speakerOn}
          onToggleSpeaker={toggleSpeaker}
          canFlipCamera={canFlipCamera}
          onFlipCamera={flipCamera}
        />
      );

  return createPortal(content, document.body);
}
