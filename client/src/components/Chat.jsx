import { useState, useEffect, useRef } from 'react';
import './Chat.css';

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Chat({ socket, roomId, userName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (data) => {
      setMessages((prev) => [...prev, data]);
    };

    socket.on('chat-message', handleMessage);

    return () => {
      socket.off('chat-message', handleMessage);
    };
  }, [socket]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text || !socket) return;

    const messageData = {
      roomId,
      message: text,
    };

    socket.emit('chat-message', messageData);

    // Optimistically add own message
    setMessages((prev) => [
      ...prev,
      {
        from: userName,
        message: text,
        timestamp: new Date().toISOString(),
        isSelf: true,
      },
    ]);

    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <span>💬</span>
            <p>No messages yet</p>
          </div>
        )}
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`chat-bubble ${msg.isSelf || msg.from === userName ? 'chat-self' : 'chat-other'}`}
          >
            {!(msg.isSelf || msg.from === userName) && (
              <span className="chat-sender">{msg.from}</span>
            )}
            <p className="chat-text">{msg.message}</p>
            <span className="chat-time">{formatTime(msg.timestamp)}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-bar">
        <input
          type="text"
          className="input-field chat-input"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="btn btn-primary chat-send-btn"
          onClick={sendMessage}
          disabled={!input.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
