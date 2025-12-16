import React, { useEffect, useRef } from 'react';

/**
 * 🎨 Visualizer Component
 * หน้าที่: วาดกราฟิกวงกลมเต้นตามเสียง
 * เทคนิค: ใช้ HTML5 Canvas API + requestAnimationFrame
 */

interface VisualizerProps {
  isActive: boolean; // กำลังคุยอยู่ไหม
  volume: number;    // ความดัง (0.0 ถึง 1.0)
  source: 'user' | 'ai'; // ใครพูด
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, volume, source }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null); // อ้างอิงถึง <canvas> ใน DOM
  const requestRef = useRef<number>(); // เก็บ ID ของ Animation Frame
  
  // ตัวแปรสำหรับ Animation ที่ต้องการความต่อเนื่อง
  const smoothVolRef = useRef(0); // ค่าความดังที่ผ่านการเกลี่ยให้นุ่มนวล (Smooth)
  const phaseRef = useRef(0);     // เฟสของคลื่น (Sine Wave Phase)

  // ฟังก์ชันวาด (ทำงานซ้ำๆ 60 ครั้งต่อวินาที)
  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. เพิ่ม Phase (เพื่อให้วงกลมขยับดุ๊กดิ๊กแม้ไม่มีเสียง)
    phaseRef.current += 0.02;
    
    // 2. คำนวณความนุ่มนวล (Linear Interpolation)
    // ถ้าเสียงดังขึ้น ให้พุ่งขึ้นเร็ว (Attack)
    // ถ้าเสียงเบาลง ให้ค่อยๆ ลด (Decay)
    if (volume > smoothVolRef.current) {
        smoothVolRef.current += (volume - smoothVolRef.current) * 0.2; 
    } else {
        smoothVolRef.current += (volume - smoothVolRef.current) * 0.05; 
    }

    const currentVol = smoothVolRef.current;
    
    // เตรียมพื้นที่วาด
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height); // ล้างภาพเก่า

    // กรณี Idle (ไม่ได้คุย): วาดจุดหายใจเบาๆ
    if (!isActive) {
      const breathingRadius = 50 + Math.sin(phaseRef.current * 2) * 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, breathingRadius, 0, 2 * Math.PI);
      ctx.fillStyle = '#F1F5F9'; // สีเทาอ่อน
      ctx.fill();
      requestRef.current = requestAnimationFrame(animate); // เรียกตัวเองซ้ำ
      return;
    }

    // กรณี Active: เลือกสีตามคนพูด
    // User: สีฟ้า (#2563EB)
    // AI: สีชมพู (#EC4899)
    const color = source === 'user' 
        ? '37, 99, 235'   
        : '236, 72, 153'; 

    // วาดวงกลม 3 ชั้นซ้อนกัน (Ripples)
    const layers = 3;
    const maxRadius = 180; // ขนาดขยายสูงสุด

    for (let i = 0; i < layers; i++) {
        // คำนวณขนาด: ฐาน + ขยายตามเสียง + ขยับตาม Sine Wave
        const layerVol = Math.max(0, currentVol - (i * 0.1));
        const r = 80 + (i * 20) + (layerVol * maxRadius) + (Math.sin(phaseRef.current + i) * 5);
        
        // ยิ่งวงนอก ยิ่งจาง
        const opacity = 0.6 - (i * 0.2); 
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, Math.max(0, r), 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(${color}, ${opacity})`;
        ctx.fill();
    }
    
    // วงกลมตรงกลาง (แกน)
    ctx.beginPath();
    ctx.arc(centerX, centerY, 60 + (currentVol * 20), 0, 2 * Math.PI);
    ctx.fillStyle = `rgb(${color})`;
    ctx.fill();

    // Loop ต่อไป
    requestRef.current = requestAnimationFrame(animate);
  };

  // เรียกใช้ Animation เมื่อ Component โหลด
  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      // เมื่อ Component หายไป ให้หยุดวาด (ป้องกัน Memory Leak)
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