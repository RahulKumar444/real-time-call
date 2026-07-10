import { useState, useEffect } from 'react';
import API from '../api/axios';
import './FileShare.css';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function getFileIcon(mimeType) {
  if (!mimeType) return '📄';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return '📦';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
  return '📄';
}

export default function FileShare({ socket, roomId }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (!socket) return;

    const handleFileShared = ({ fileData }) => {
      setFiles((prev) => {
        // Avoid duplicates
        if (prev.some((f) => f._id === fileData._id)) return prev;
        return [...prev, fileData];
      });
    };

    socket.on('file-shared', handleFileShared);

    return () => {
      socket.off('file-shared', handleFileShared);
    };
  }, [socket]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('roomId', roomId);

      const { data } = await API.post('/api/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1)
          );
          setUploadProgress(percent);
        },
      });

      const fileData = data.file || data;

      // Add to local list
      setFiles((prev) => [...prev, fileData]);

      // Notify other users
      if (socket) {
        socket.emit('file-shared', { roomId, fileData });
      }
    } catch (err) {
      console.error('File upload failed:', err);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      // Reset file input
      e.target.value = '';
    }
  };

  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  return (
    <div className="fileshare-panel">
      <div className="fileshare-upload">
        <label className={`btn btn-primary fileshare-upload-btn ${uploading ? 'uploading' : ''}`}>
          {uploading ? (
            <>
              <span className="btn-spinner" />
              {uploadProgress}%
            </>
          ) : (
            <>
              📎 Upload File
            </>
          )}
          <input
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            className="fileshare-input"
            accept="*/*"
          />
        </label>
      </div>

      <div className="fileshare-list">
        {files.length === 0 && (
          <div className="fileshare-empty">
            <span>📁</span>
            <p>No files shared yet</p>
          </div>
        )}
        {files.map((file) => (
          <a
            key={file._id}
            href={`${baseURL}/api/files/${file._id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="fileshare-item"
          >
            <span className="fileshare-icon">{getFileIcon(file.mimeType)}</span>
            <div className="fileshare-info">
              <span className="fileshare-name">{file.originalName || file.fileName}</span>
              <span className="fileshare-size">{formatSize(file.size)}</span>
            </div>
            <span className="fileshare-download">⬇</span>
          </a>
        ))}
      </div>
    </div>
  );
}
