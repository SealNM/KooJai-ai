import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * 🏁 Entry Point
 * นี่คือจุดสตาร์ทของโปรแกรม React ทั้งหมด
 */

// 1. หา Element ที่ชื่อ "root" ในไฟล์ index.html
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// 2. สร้าง React Root (รากฐานของต้นไม้ Component)
const root = ReactDOM.createRoot(rootElement);

// 3. Render (วาด) แอพลงไป
// React.StrictMode ช่วยตรวจสอบปัญหาต่างๆ ตอนเขียนโค้ด (Development Mode)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);