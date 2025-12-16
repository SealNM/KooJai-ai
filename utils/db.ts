import { TeacherReport, MoodEntry } from '../types';

/**
 * 🗄️ Database Utility
 * เราใช้ "IndexedDB" ซึ่งเป็นฐานข้อมูลที่ฝังอยู่ใน Browser (Chrome, Safari, etc.)
 * ข้อดี: เก็บข้อมูลได้เยอะกว่า LocalStorage และเก็บแบบ Object ได้
 * ข้อเสีย: เขียนโค้ดยากกว่า (เป็น Asynchronous Event-based)
 */

const DB_NAME = 'KooJaiDB';
const DB_VERSION = 2; // ถ้าแก้โครงสร้าง DB ต้องเพิ่มเลขนี้
const STORE_REPORTS = 'reports'; // ตารางเก็บรายงาน
const STORE_MOODS = 'moods';     // ตารางเก็บอารมณ์

// ฟังก์ชันเปิด/สร้างฐานข้อมูล
export const initDB = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event);
      reject("Error opening database");
    };

    // ทำงานเมื่อมีการสร้าง DB ครั้งแรก หรือเปลี่ยน Version
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // สร้างตาราง reports
      if (!db.objectStoreNames.contains(STORE_REPORTS)) {
        db.createObjectStore(STORE_REPORTS, { keyPath: 'id', autoIncrement: true });
      }

      // สร้างตาราง moods
      if (!db.objectStoreNames.contains(STORE_MOODS)) {
        db.createObjectStore(STORE_MOODS, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => {
      resolve();
    };
  });
};

// ฟังก์ชันบันทึกรายงาน
export const saveReport = (report: TeacherReport): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = db.transaction([STORE_REPORTS], 'readwrite'); // เปิด Transaction
      const store = transaction.objectStore(STORE_REPORTS);
      
      const reportWithTimestamp = {
        ...report,
        createdAt: Date.now()
      };

      const addRequest = store.add(reportWithTimestamp); // เพิ่มข้อมูล

      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject("Error saving report");
    };

    request.onerror = () => reject("Error opening database for saving report");
  });
};

// ฟังก์ชันบันทึกอารมณ์
export const saveMood = (entry: MoodEntry): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const tx = db.transaction([STORE_MOODS], 'readwrite');
      const store = tx.objectStore(STORE_MOODS);
      const req = store.add(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject("Error saving mood");
    };
  });
};

// ฟังก์ชันดึง "ความจำล่าสุด" (Memory) ของนักเรียนคนนั้นๆ
export const getLastMemory = (studentId: string): Promise<string | null> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const tx = db.transaction([STORE_REPORTS], 'readonly');
      const store = tx.objectStore(STORE_REPORTS);
      const getAll = store.getAll(); // ดึงมาทั้งหมด (จริงๆ ควรใช้ Index เพื่อประสิทธิภาพถ้าข้อมูลเยอะ)

      getAll.onsuccess = () => {
        const reports = getAll.result as (TeacherReport & { createdAt: number })[];
        
        // กรองเฉพาะของนักเรียนคนนี้ และเรียงเอาอันล่าสุดขึ้นก่อน
        const studentReports = reports
          .filter(r => r.student_id === studentId)
          .sort((a, b) => b.createdAt - a.createdAt);
        
        if (studentReports.length > 0 && studentReports[0].memory_for_next_session) {
          resolve(studentReports[0].memory_for_next_session);
        } else {
          resolve(null);
        }
      };
      getAll.onerror = () => reject("Error getting memory");
    };
  });
};