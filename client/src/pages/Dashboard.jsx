import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [joinRoomId, setJoinRoomId] = useState('');
  const [generatedRoomId, setGeneratedRoomId] = useState('');
  const [recentRooms, setRecentRooms] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('syncspace_recent_rooms');
    if (stored) {
      try {
        setRecentRooms(JSON.parse(stored));
      } catch {
        // ignore invalid JSON
      }
    }
  }, []);

  const saveRecentRoom = (roomId) => {
    const updated = [roomId, ...recentRooms.filter((r) => r !== roomId)].slice(0, 5);
    setRecentRooms(updated);
    localStorage.setItem('syncspace_recent_rooms', JSON.stringify(updated));
  };

  const handleCreateRoom = () => {
    const id = generateRoomId();
    setGeneratedRoomId(id);
  };

  const handleEnterRoom = (roomId) => {
    if (!roomId.trim()) return;
    saveRecentRoom(roomId.trim());
    navigate(`/room/${roomId.trim()}`);
  };

  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(generatedRoomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-page animate-fade-in">
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="header-logo gradient-text">SyncSpace</h1>
        </div>
        <div className="header-right">
          <span className="user-greeting">
            👋 Hey, <strong>{user?.name || 'User'}</strong>
          </span>
          <button className="btn btn-secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        <div className="dashboard-grid">
          {/* Create Room Card */}
          <div className="glass-card dashboard-card animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="card-icon">🚀</div>
            <h2 className="card-title">Create Room</h2>
            <p className="card-desc">Start a new collaboration space and invite others</p>

            {!generatedRoomId ? (
              <button className="btn btn-primary card-btn" onClick={handleCreateRoom}>
                Generate Room
              </button>
            ) : (
              <div className="generated-room">
                <div className="room-id-display">
                  <code className="room-id-code">{generatedRoomId}</code>
                  <button
                    className="btn-copy"
                    onClick={handleCopyRoomId}
                    title="Copy Room ID"
                  >
                    {copied ? '✓' : '📋'}
                  </button>
                </div>
                <button
                  className="btn btn-primary card-btn"
                  onClick={() => handleEnterRoom(generatedRoomId)}
                >
                  Enter Room →
                </button>
              </div>
            )}
          </div>

          {/* Join Room Card */}
          <div className="glass-card dashboard-card animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <div className="card-icon">🔗</div>
            <h2 className="card-title">Join Room</h2>
            <p className="card-desc">Enter a room ID to join an existing session</p>

            <div className="join-form">
              <input
                type="text"
                className="input-field"
                placeholder="Enter Room ID"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEnterRoom(joinRoomId)}
              />
              <button
                className="btn btn-primary card-btn"
                onClick={() => handleEnterRoom(joinRoomId)}
                disabled={!joinRoomId.trim()}
              >
                Join →
              </button>
            </div>
          </div>
        </div>

        {/* Recent Rooms */}
        {recentRooms.length > 0 && (
          <div className="recent-rooms animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <h3 className="recent-title">Recent Rooms</h3>
            <div className="recent-list">
              {recentRooms.map((roomId) => (
                <button
                  key={roomId}
                  className="recent-room-btn"
                  onClick={() => handleEnterRoom(roomId)}
                >
                  <span className="recent-room-icon">📡</span>
                  <code>{roomId}</code>
                  <span className="recent-room-arrow">→</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
