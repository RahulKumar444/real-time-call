import { useRef, useState, useEffect, useCallback } from 'react';
import './Whiteboard.css';

const COLORS = ['#ffffff', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899'];
const LINE_WIDTHS = [
  { label: 'S', value: 2 },
  { label: 'M', value: 5 },
  { label: 'L', value: 10 },
];

export default function Whiteboard({ socket, roomId }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);

  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser'
  const [color, setColor] = useState('#ffffff');
  const [lineWidth, setLineWidth] = useState(5);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      const rect = parent.getBoundingClientRect();
      // Save current drawing
      const prevData = ctxRef.current
        ? ctxRef.current.getImageData(0, 0, canvas.width, canvas.height)
        : null;
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d');
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctxRef.current = ctx;
      // Fill with dark background
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Restore drawing if possible
      if (prevData) {
        ctx.putImageData(prevData, 0, 0);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Draw function for both local and remote
  const drawOnCanvas = useCallback((drawData) => {
    const ctx = ctxRef.current;
    if (!ctx || !drawData.points || drawData.points.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = drawData.type === 'erase' ? '#1a1a2e' : drawData.color;
    ctx.lineWidth = drawData.type === 'erase' ? drawData.lineWidth * 3 : drawData.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const points = drawData.points;
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }, []);

  // Listen for remote draw events
  useEffect(() => {
    if (!socket) return;

    const handleDraw = (drawData) => {
      drawOnCanvas(drawData);
    };

    const handleClear = () => {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (ctx && canvas) {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };

    socket.on('draw', handleDraw);
    socket.on('clear-whiteboard', handleClear);

    return () => {
      socket.off('draw', handleDraw);
      socket.off('clear-whiteboard', handleClear);
    };
  }, [socket, drawOnCanvas]);

  // Get position from event
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    isDrawingRef.current = true;
    lastPointRef.current = getPos(e);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawingRef.current || !lastPointRef.current) return;

    const currentPoint = getPos(e);
    const drawData = {
      type: tool === 'eraser' ? 'erase' : 'draw',
      points: [lastPointRef.current, currentPoint],
      color,
      lineWidth,
    };

    drawOnCanvas(drawData);

    if (socket) {
      socket.emit('draw', { roomId, drawData });
    }

    lastPointRef.current = currentPoint;
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearCanvas = () => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (socket) {
      socket.emit('clear-whiteboard', { roomId });
    }
  };

  return (
    <div className="whiteboard-panel">
      <div className="wb-toolbar">
        <div className="wb-tools">
          <button
            className={`btn-icon wb-tool ${tool === 'pen' ? 'active' : ''}`}
            onClick={() => setTool('pen')}
            title="Pen"
          >
            ✏️
          </button>
          <button
            className={`btn-icon wb-tool ${tool === 'eraser' ? 'active' : ''}`}
            onClick={() => setTool('eraser')}
            title="Eraser"
          >
            🧹
          </button>
        </div>

        <div className="wb-colors">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`wb-color-btn ${color === c ? 'selected' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => { setColor(c); setTool('pen'); }}
              title={c}
            />
          ))}
        </div>

        <div className="wb-widths">
          {LINE_WIDTHS.map(({ label, value }) => (
            <button
              key={value}
              className={`wb-width-btn ${lineWidth === value ? 'active' : ''}`}
              onClick={() => setLineWidth(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <button className="btn btn-danger wb-clear-btn" onClick={clearCanvas}>
          Clear
        </button>
      </div>

      <div className="wb-canvas-container">
        <canvas
          ref={canvasRef}
          className="wb-canvas"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
    </div>
  );
}
