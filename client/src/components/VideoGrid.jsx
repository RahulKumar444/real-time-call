import { useRef, useEffect } from 'react';
import './VideoGrid.css';

function VideoTile({ stream, userName, isMuted, isLocal, isScreenSharing }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      if (stream) {
        videoRef.current.srcObject = stream;
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  const hasVideo = stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  return (
    <div className={`video-tile ${isLocal ? 'local-tile' : ''}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`video-element ${!hasVideo ? 'video-hidden' : ''}`}
      />
      {!hasVideo && (
        <div className="video-avatar">
          <span>{(userName || '?')[0].toUpperCase()}</span>
        </div>
      )}
      <div className="video-label">
        <span className="video-name">{isLocal ? 'You' : userName || 'Peer'}</span>
        {isLocal && isScreenSharing && <span className="sharing-badge">📺 Sharing</span>}
        {isMuted && <span className="muted-icon">🔇</span>}
      </div>
    </div>
  );
}

export default function VideoGrid({ localStream, remoteStreams, peersList = [], userName, isAudioEnabled, isScreenSharing }) {
  const totalParticipants = 1 + peersList.length;

  const getGridClass = () => {
    if (totalParticipants === 1) return 'grid-1';
    if (totalParticipants === 2) return 'grid-2';
    if (totalParticipants <= 4) return 'grid-4';
    return 'grid-many';
  };

  return (
    <div className={`video-grid ${getGridClass()}`}>
      <VideoTile
        stream={localStream}
        userName={userName}
        isMuted={!isAudioEnabled}
        isLocal={true}
        isScreenSharing={isScreenSharing}
      />
      {peersList.map((peer) => (
        <VideoTile
          key={peer.socketId}
          stream={remoteStreams[peer.socketId]?.stream || null}
          userName={peer.userName}
          isMuted={false}
          isLocal={false}
          isScreenSharing={false}
        />
      ))}
    </div>
  );
}
