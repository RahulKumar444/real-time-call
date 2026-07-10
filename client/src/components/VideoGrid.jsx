import { useRef, useEffect } from 'react';
import './VideoGrid.css';

function VideoTile({ stream, userName, isMuted, isLocal }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = stream && stream.getVideoTracks().some((t) => t.enabled);

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
        {isMuted && <span className="muted-icon">🔇</span>}
      </div>
    </div>
  );
}

export default function VideoGrid({ localStream, remoteStreams, userName, isAudioEnabled }) {
  const totalParticipants = 1 + Object.keys(remoteStreams).length;

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
      />
      {Object.entries(remoteStreams).map(([socketId, { stream, userName: peerName }]) => (
        <VideoTile
          key={socketId}
          stream={stream}
          userName={peerName}
          isMuted={false}
          isLocal={false}
        />
      ))}
    </div>
  );
}
