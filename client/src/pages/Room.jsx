import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import useWebRTC from '../hooks/useWebRTC';
import VideoGrid from '../components/VideoGrid';
import Chat from '../components/Chat';
import Whiteboard from '../components/Whiteboard';
import FileShare from '../components/FileShare';
import './Room.css';

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const socket = useSocket();

  const {
    localStream,
    remoteStreams,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
  } = useWebRTC(socket, roomId);

  const [activePanel, setActivePanel] = useState('chat'); // 'chat' | 'whiteboard' | 'files' | null
  const [copied, setCopied] = useState(false);
  const [participantsCount, setParticipantsCount] = useState(1);

  // Update participant count
  useEffect(() => {
    setParticipantsCount(1 + Object.keys(remoteStreams).length);
  }, [remoteStreams]);

  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleLeave = () => {
    navigate('/');
  };

  const togglePanel = (panelName) => {
    if (activePanel === panelName) {
      setActivePanel(null);
    } else {
      setActivePanel(panelName);
    }
  };

  return (
    <div className="room-page">
      {/* Top Controls Bar */}
      <header className="room-header">
        <div className="room-info">
          <h2 className="room-title">SyncSpace Room</h2>
          <div className="room-id-badge" onClick={handleCopyRoomId}>
            <span>ID:</span>
            <code>{roomId}</code>
            <span className="copy-hint">{copied ? '✓ Copied' : '📋'}</span>
          </div>
          <div className="participant-badge">
            👥 {participantsCount} {participantsCount === 1 ? 'user' : 'users'}
          </div>
        </div>

        <div className="room-media-controls">
          <button
            className={`btn-control ${isAudioEnabled ? 'active' : 'disabled'}`}
            onClick={toggleAudio}
            title={isAudioEnabled ? 'Mute Mic' : 'Unmute Mic'}
          >
            {isAudioEnabled ? '🎤' : '🎙️'}
          </button>
          <button
            className={`btn-control ${isVideoEnabled ? 'active' : 'disabled'}`}
            onClick={toggleVideo}
            title={isVideoEnabled ? 'Stop Video' : 'Start Video'}
          >
            {isVideoEnabled ? '📷' : '📹'}
          </button>
          <button
            className={`btn-control ${isScreenSharing ? 'active-share' : ''}`}
            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
            title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
          >
            🖥️ {isScreenSharing ? 'Sharing' : 'Share'}
          </button>
        </div>

        <div className="room-utility-controls">
          <button
            className={`btn btn-tab ${activePanel === 'chat' ? 'active' : ''}`}
            onClick={() => togglePanel('chat')}
          >
            💬 Chat
          </button>
          <button
            className={`btn btn-tab ${activePanel === 'whiteboard' ? 'active' : ''}`}
            onClick={() => togglePanel('whiteboard')}
          >
            🎨 Whiteboard
          </button>
          <button
            className={`btn btn-tab ${activePanel === 'files' ? 'active' : ''}`}
            onClick={() => togglePanel('files')}
          >
            📁 Files
          </button>
          <button className="btn btn-danger btn-leave" onClick={handleLeave}>
            Leave
          </button>
        </div>
      </header>

      {/* Main Room Layout */}
      <div className="room-main">
        {/* Left Side: Video streams */}
        <div className="room-video-container">
          <VideoGrid
            localStream={localStream}
            remoteStreams={remoteStreams}
            userName={user?.name || 'You'}
            isAudioEnabled={isAudioEnabled}
          />
        </div>

        {/* Right Side: Toggleable Side Panels */}
        {activePanel && (
          <aside className="room-sidebar animate-slide-in">
            <div className="sidebar-header">
              <h3>
                {activePanel === 'chat' && 'Room Chat'}
                {activePanel === 'whiteboard' && 'Collaborative Canvas'}
                {activePanel === 'files' && 'Shared Documents'}
              </h3>
              <button className="btn-close" onClick={() => setActivePanel(null)}>
                ×
              </button>
            </div>
            <div className="sidebar-body">
              {activePanel === 'chat' && (
                <Chat socket={socket} roomId={roomId} userName={user?.name || 'User'} />
              )}
              {activePanel === 'whiteboard' && (
                <Whiteboard socket={socket} roomId={roomId} />
              )}
              {activePanel === 'files' && (
                <FileShare socket={socket} roomId={roomId} />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
