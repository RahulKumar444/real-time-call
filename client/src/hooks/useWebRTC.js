import { useRef, useState, useEffect, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

export default function useWebRTC(socket, roomId) {
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const pendingCandidatesRef = useRef({});
  const socketRef = useRef(socket);
  const mediaReadyRef = useRef(false);

  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [peersList, setPeersList] = useState([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef(null);
  const originalVideoTrackRef = useRef(null);

  // Keep socketRef in sync
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  // Close a specific peer connection
  const closePeerConnection = useCallback((socketId) => {
    const peer = peersRef.current[socketId];
    if (peer) {
      peer.peerConnection.close();
      delete peersRef.current[socketId];
    }
    delete pendingCandidatesRef.current[socketId];
    setRemoteStreams((prev) => {
      const updated = { ...prev };
      delete updated[socketId];
      return updated;
    });
  }, []);

  // Close all peer connections
  const closeAllPeerConnections = useCallback(() => {
    Object.keys(peersRef.current).forEach((socketId) => {
      peersRef.current[socketId].peerConnection.close();
    });
    peersRef.current = {};
    pendingCandidatesRef.current = {};
    setRemoteStreams({});
  }, []);

  // Process any ICE candidates that arrived before remote description was set
  const processPendingCandidates = useCallback(async (socketId) => {
    const candidates = pendingCandidatesRef.current[socketId];
    const peer = peersRef.current[socketId];
    if (candidates && peer) {
      for (const candidate of candidates) {
        try {
          await peer.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding buffered ICE candidate:', err);
        }
      }
      delete pendingCandidatesRef.current[socketId];
    }
  }, []);

  // Create a new peer connection for a given target socket
  const createPeerConnection = useCallback(
    (targetSocketId, userName) => {
      // Close existing connection if any
      if (peersRef.current[targetSocketId]) {
        peersRef.current[targetSocketId].peerConnection.close();
        delete peersRef.current[targetSocketId];
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);

      // Add local tracks to the peer connection if they exist
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('ice-candidate', {
            to: targetSocketId,
            candidate: event.candidate,
          });
        }
      };

      // Handle incoming tracks
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        setRemoteStreams((prev) => ({
          ...prev,
          [targetSocketId]: {
            stream: remoteStream,
            userName: userName || 'Unknown',
          },
        }));
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] ${targetSocketId} state: ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
          closePeerConnection(targetSocketId);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ${targetSocketId} ICE state: ${pc.iceConnectionState}`);
      };

      peersRef.current[targetSocketId] = { peerConnection: pc, userName };
      return pc;
    },
    [closePeerConnection]
  );

  // Initialize local media
  useEffect(() => {
    let cancelled = false;

    const initMedia = async () => {
      // Try video + audio
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        mediaReadyRef.current = true;
        setLocalStream(stream);
        setIsAudioEnabled(true);
        setIsVideoEnabled(true);
        return;
      } catch (err) {
        console.warn('Camera+mic not available:', err.message);
      }

      // Try audio only
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
        if (cancelled) {
          audioStream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = audioStream;
        mediaReadyRef.current = true;
        setLocalStream(audioStream);
        setIsAudioEnabled(true);
        setIsVideoEnabled(false);
        return;
      } catch (err) {
        console.warn('Mic not available:', err.message);
      }

      // No devices — proceed without
      console.log('No media devices available');
      mediaReadyRef.current = true;
      setIsAudioEnabled(false);
      setIsVideoEnabled(false);
    };

    initMedia();

    return () => {
      cancelled = true;
    };
  }, []);

  // When localStream becomes available AFTER peer connections already exist,
  // add the tracks to every existing peer connection and renegotiate
  useEffect(() => {
    if (!localStream) return;

    Object.entries(peersRef.current).forEach(([targetSocketId, { peerConnection }]) => {
      // Check if tracks are already added
      const senders = peerConnection.getSenders();
      const existingTrackIds = new Set(senders.map(s => s.track?.id).filter(Boolean));
      const newTracks = localStream.getTracks().filter(t => !existingTrackIds.has(t.id));

      if (newTracks.length === 0) return;

      // Add the new tracks
      newTracks.forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      // Renegotiate
      (async () => {
        try {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          if (socketRef.current) {
            socketRef.current.emit('offer', { to: targetSocketId, offer });
          }
        } catch (err) {
          console.error('Error renegotiating after adding tracks:', err);
        }
      })();
    });
  }, [localStream]);

  // Socket event handlers for WebRTC signaling
  useEffect(() => {
    if (!socket || !roomId) return;

    // Join the room
    socket.emit('join-room', { roomId });

    // When we get the list of existing users in the room
    const handleRoomUsers = async (users) => {
      const otherUsers = users.filter((u) => u.socketId !== socket.id);
      setPeersList(otherUsers);

      for (const user of otherUsers) {
        const pc = createPeerConnection(user.socketId, user.userName);
        if (!pc) continue;

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('offer', { to: user.socketId, offer });
        } catch (err) {
          console.error('Error creating offer:', err);
        }
      }
    };

    // When a new user joins after us
    const handleUserJoined = (userData) => {
      console.log('User joined:', userData.userName);
      setPeersList((prev) => {
        if (prev.some((p) => p.socketId === userData.socketId)) return prev;
        return [...prev, userData];
      });
    };

    // When a user leaves
    const handleUserLeft = (userData) => {
      console.log('User left:', userData.userName);
      closePeerConnection(userData.socketId);
      setPeersList((prev) => prev.filter((p) => p.socketId !== userData.socketId));
    };

    // Receive an offer from another user
    const handleOffer = async ({ from, offer }) => {
      let pc;
      const existingPeer = peersRef.current[from];
      if (existingPeer && existingPeer.peerConnection.signalingState !== 'closed') {
        pc = existingPeer.peerConnection;
      } else {
        pc = createPeerConnection(from, 'Peer');
      }
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await processPendingCandidates(from);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { to: from, answer });
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    };

    // Receive an answer
    const handleAnswer = async ({ from, answer }) => {
      const peer = peersRef.current[from];
      if (!peer) return;

      try {
        await peer.peerConnection.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
        await processPendingCandidates(from);
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    };

    // Receive an ICE candidate
    const handleIceCandidate = async ({ from, candidate }) => {
      const peer = peersRef.current[from];
      if (!peer) {
        if (!pendingCandidatesRef.current[from]) {
          pendingCandidatesRef.current[from] = [];
        }
        pendingCandidatesRef.current[from].push(candidate);
        return;
      }

      if (!peer.peerConnection.remoteDescription) {
        if (!pendingCandidatesRef.current[from]) {
          pendingCandidatesRef.current[from] = [];
        }
        pendingCandidatesRef.current[from].push(candidate);
        return;
      }

      try {
        await peer.peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    };

    socket.on('room-users', handleRoomUsers);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);

    return () => {
      socket.off('room-users', handleRoomUsers);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.emit('leave-room', { roomId });
      closeAllPeerConnections();
    };
  }, [socket, roomId, createPeerConnection, closePeerConnection, closeAllPeerConnections, processPendingCandidates]);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  }, []);

  // Start screen sharing
  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenStreamRef.current = screenStream;

      const originalTrack = localStreamRef.current
        ? localStreamRef.current.getVideoTracks()[0]
        : null;
      originalVideoTrackRef.current = originalTrack;

      // Replace or add video track in all peer connections
      Object.entries(peersRef.current).forEach(([targetSocketId, { peerConnection }]) => {
        const sender = peerConnection
          .getSenders()
          .find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        } else if (peerConnection.signalingState !== 'closed') {
          peerConnection.addTrack(screenTrack, screenStream);
          // Renegotiate
          (async () => {
            try {
              const offer = await peerConnection.createOffer();
              await peerConnection.setLocalDescription(offer);
              if (socketRef.current) {
                socketRef.current.emit('offer', { to: targetSocketId, offer });
              }
            } catch (err) {
              console.error('Screen share renegotiation error:', err);
            }
          })();
        }
      });

      // Update local stream for display
      if (localStreamRef.current) {
        if (originalTrack) {
          localStreamRef.current.removeTrack(originalTrack);
        }
        localStreamRef.current.addTrack(screenTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      } else {
        localStreamRef.current = new MediaStream([screenTrack]);
        setLocalStream(localStreamRef.current);
      }
      setIsScreenSharing(true);

      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.error('Error starting screen share:', err);
    }
  }, []);

  // Stop screen sharing
  const stopScreenShare = useCallback(() => {
    const originalTrack = originalVideoTrackRef.current;

    Object.values(peersRef.current).forEach(({ peerConnection }) => {
      const sender = peerConnection
        .getSenders()
        .find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        if (originalTrack) {
          sender.replaceTrack(originalTrack);
        } else {
          sender.replaceTrack(null);
        }
      }
    });

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    if (localStreamRef.current) {
      const currentScreenTrack = localStreamRef.current.getVideoTracks()[0];
      if (currentScreenTrack) {
        localStreamRef.current.removeTrack(currentScreenTrack);
      }
      if (originalTrack) {
        localStreamRef.current.addTrack(originalTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      } else {
        const audioTracks = localStreamRef.current.getAudioTracks();
        if (audioTracks.length > 0) {
          setLocalStream(new MediaStream(audioTracks));
        } else {
          setLocalStream(null);
          localStreamRef.current = null;
        }
      }
    }
    setIsScreenSharing(false);
    originalVideoTrackRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeAllPeerConnections();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [closeAllPeerConnections]);

  return {
    localStream,
    remoteStreams,
    peersList,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
  };
}
