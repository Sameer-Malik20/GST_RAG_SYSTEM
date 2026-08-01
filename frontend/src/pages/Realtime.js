import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { LuMic, LuMicOff, LuPhoneOff } from 'react-icons/lu';
import { useToast } from '../contexts/ToastContext';
import { getFastApiUrl } from '../config';
import '../styles/Realtime.css';

function Realtime() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcripts, setTranscripts] = useState([]);

  const { showToast } = useToast();

  const peerConnectionRef = useRef(null);
  const audioStreamRef = useRef(null);
  const dataChannelRef = useRef(null);
  const audioAnalyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  const cleanupWebRTC = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setAudioLevel(0);
  }, []);

  const startAudioAnalysis = useCallback((stream) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    
    analyser.fftSize = 256;
    source.connect(analyser);
    audioAnalyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
      setAudioLevel(average / 255);
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }, []);

  const connectRealtime = useCallback(async () => {
    try {
      setIsConnecting(true);
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      startAudioAnalysis(stream);

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
      };

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === 'response.audio_transcript.delta') {
            setTranscripts(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant' && !last.final) {
                return [...prev.slice(0, -1), { ...last, text: last.text + event.delta }];
              }
              return [...prev, { role: 'assistant', text: event.delta, final: false }];
            });
          } else if (event.type === 'response.audio_transcript.done') {
            setTranscripts(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant') {
                return [...prev.slice(0, -1), { ...last, final: true }];
              }
              return prev;
            });
          }
        } catch (err) {
          console.error('Error parsing Realtime event:', err);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(`${getFastApiUrl()}/realtime/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: offer.sdp }),
        credentials: 'include'
      });

      if (!sdpResponse.ok) {
        throw new Error(`Connection failed: ${sdpResponse.status} ${sdpResponse.statusText}`);
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    } catch (err) {
      showToast(err.message || "Failed to start Realtime voice chat.");
      cleanupWebRTC();
    }
  }, [startAudioAnalysis, cleanupWebRTC, showToast]);

  const toggleMute = useCallback(() => {
    if (audioStreamRef.current) {
      const audioTrack = audioStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  }, [isMuted]);

  useEffect(() => {
    return () => {
      cleanupWebRTC();
    };
  }, [cleanupWebRTC]);

  return (
    <div className="realtime-container">
      <div className="realtime-visualizer-wrap">
        <motion.div
          className={`realtime-orb ${isConnected ? 'active' : ''} ${isConnecting ? 'connecting' : ''}`}
          animate={{
            scale: isConnected ? 1 + audioLevel * 0.5 : 1,
          }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <div className="orb-inner" />
        </motion.div>

        <div className="realtime-status-text">
          {isConnecting && "Connecting to voice chat..."}
          {isConnected && (isMuted ? "Microphone muted" : "Listening...")}
          {!isConnected && !isConnecting && "Click start to begin voice chat"}
        </div>
      </div>

      <div className="realtime-transcript-wrap">
        {transcripts.map((t, i) => (
          <div key={i} className={`transcript-bubble ${t.role}`}>
            {t.text}
          </div>
        ))}
      </div>

      <div className="realtime-controls">
        {!isConnected ? (
          <button
            className="realtime-btn start-btn"
            onClick={connectRealtime}
            disabled={isConnecting}
          >
            <LuMic />
            {isConnecting ? "Connecting..." : "Start Voice Chat"}
          </button>
        ) : (
          <>
            <button
              className={`realtime-btn mute-btn ${isMuted ? 'muted' : ''}`}
              onClick={toggleMute}
            >
              {isMuted ? <LuMicOff /> : <LuMic />}
            </button>
            <button
              className="realtime-btn end-btn"
              onClick={cleanupWebRTC}
            >
              <LuPhoneOff />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default Realtime;
