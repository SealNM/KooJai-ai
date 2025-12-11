import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  volume: number; // 0.0 to 1.0
  source: 'user' | 'ai';
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, volume, source }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  
  // Smooth out the volume
  const smoothVolRef = useRef(0);
  const phaseRef = useRef(0);

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Time step for subtle idle movement
    phaseRef.current += 0.02;
    
    // Decay logic
    if (volume > smoothVolRef.current) {
        smoothVolRef.current += (volume - smoothVolRef.current) * 0.2; // Attack
    } else {
        smoothVolRef.current += (volume - smoothVolRef.current) * 0.05; // Decay
    }

    const currentVol = smoothVolRef.current;
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    if (!isActive) {
      // Idle state: Small breathing dot
      const breathingRadius = 50 + Math.sin(phaseRef.current * 2) * 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, breathingRadius, 0, 2 * Math.PI);
      ctx.fillStyle = '#F1F5F9'; // Slate-100
      ctx.fill();
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    // Distinct Colors
    // User: Deep Blue (#2563EB - Blue 600)
    // AI: Pink (#EC4899 - Pink 500)
    const color = source === 'user' 
        ? '37, 99, 235'   // Deep Blue
        : '236, 72, 153'; // Pink

    // Draw concentric pulses (No walking wave)
    // Using 3 layers of opacity
    const layers = 3;
    const maxRadius = 180; // Max size of expansion

    for (let i = 0; i < layers; i++) {
        // Each layer is slightly larger and more transparent
        // The volume drives the scale directly
        const layerVol = Math.max(0, currentVol - (i * 0.1));
        
        // Base radius + Volume expansion + Subtle breathing
        const r = 80 + (i * 20) + (layerVol * maxRadius) + (Math.sin(phaseRef.current + i) * 5);
        
        const opacity = 0.6 - (i * 0.2); 
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, Math.max(0, r), 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(${color}, ${opacity})`;
        ctx.fill();
    }
    
    // Inner core (solid)
    ctx.beginPath();
    ctx.arc(centerX, centerY, 60 + (currentVol * 20), 0, 2 * Math.PI);
    ctx.fillStyle = `rgb(${color})`;
    ctx.fill();

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isActive, volume, source]);

  return (
    <canvas 
      ref={canvasRef} 
      width={600} 
      height={600} 
      className="w-full h-full object-contain"
    />
  );
};

export default Visualizer;