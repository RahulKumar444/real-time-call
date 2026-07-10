import { useRef, useState, useEffect, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function useWebRTC(socket, roomId) {
  const localStreamRef = useRef(null);
  const peersRef = useRef({}); // socketId -> { peerConnection, userName }
  const pendingCandidatesRef = useRef({}); // socketId -> [candidates]

  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // socketId -> { stream, userName }
  const [peersList, setPeersList] = useState([]); // Array of { socketId, userId, userName }
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef(null);
  const originalVideoTrackRef = useRef(null);

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
        if (event.candidate && socket) {
          socket.emit('ice-candidate', {
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
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          closePeerConnection(targetSocketId);
        }
      };

      peersRef.current[targetSocketId] = { peerConnection: pc, userName };
      return pc;
    },
    [socket, closePeerConnection]
  );

  // Initialize local media
  useEffect(() => {
    let cancelled = false;

    const initMedia = async () => {
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
        setLocalStream(stream);
      } catch (err) {
        console.error('Failed to get user media:', err);
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
          setLocalStream(audioStream);
        } catch (audioErr) {
          console.error('Failed to get any media:', audioErr);
        }
      }
    };

    initMedia();

    return () => {
      cancelled = true;
    };
  }, []);

  // Socket event handlers for WebRTC signaling
  useEffect(() => {
    if (!socket || !localStreamRef.current || !roomId) return;

    // Join the room
    socket.emit('join-room', { roomId });

    // When we get the list of existing users in the room,
    // we (the newcomer) create an offer to EACH existing user.
    const handleRoomUsers = async (users) => {
      // Keep track of the active users in the room (excluding ourselves)
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

    // When a new user joins after us — we wait for their offer
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
      const pc = createPeerConnection(from, 'Peer');
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
        // Buffer candidates that arrive before peer connection is set up
        if (!pendingCandidatesRef.current[from]) {
          pendingCandidatesRef.current[from] = [];
        }
        pendingCandidatesRef.current[from].push(candidate);
        return;
      }

      // If remote description isn't set yet, buffer the candidate
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
  }, [socket, roomId, localStream, createPeerConnection, closePeerConnection, closeAllPeerConnections, processPendingCandidates]);

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

      // Save the original camera video track
      const originalTrack = localStreamRef.current ? localStreamRef.current.getVideoTracks()[0] : null;
      originalVideoTrackRef.current = originalTrack;

      // Replace video track in all peer connections
      Object.values(peersRef.current).forEach(({ peerConnection }) => {
        const sender = peerConnection
          .getSenders()
          .find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        } else if (peerConnection.connectionState !== 'closed') {
          // If no sender (because no camera was active), add track to peer connection
          peerConnection.addTrack(screenTrack, screenStream);
        }
      });

      // Replace video track in local stream for local display
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

      // When user clicks the browser's "Stop sharing" button
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
    if (!originalTrack) return;

    // Replace screen track with camera track in all peer connections
    Object.values(peersRef.current).forEach(({ peerConnection }) => {
      const sender = peerConnection
        .getSenders()
        .find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(originalTrack);
      }
    });

    // Stop screen stream
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    // Restore local stream
    if (localStreamRef.current) {
      const currentScreenTrack = localStreamRef.current.getVideoTracks()[0];
      if (currentScreenTrack) {
        localStreamRef.current.removeTrack(currentScreenTrack);
      }
      localStreamRef.current.addTrack(originalTrack);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
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
