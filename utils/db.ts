import { TeacherReport, MoodEntry } from '../types';

const DB_NAME = 'KooJaiDB';
const DB_VERSION = 2; // Upgraded for Moods
const STORE_REPORTS = 'reports';
const STORE_MOODS = 'moods';

export const initDB = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event);
      reject("Error opening database");
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Store 1: Reports
      if (!db.objectStoreNames.contains(STORE_REPORTS)) {
        db.createObjectStore(STORE_REPORTS, { keyPath: 'id', autoIncrement: true });
      }

      // Store 2: Moods (New in V2)
      if (!db.objectStoreNames.contains(STORE_MOODS)) {
        db.createObjectStore(STORE_MOODS, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => {
      resolve();
    };
  });
};

export const saveReport = (report: TeacherReport): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = db.transaction([STORE_REPORTS], 'readwrite');
      const store = transaction.objectStore(STORE_REPORTS);
      
      const reportWithTimestamp = {
        ...report,
        createdAt: Date.now()
      };

      const addRequest = store.add(reportWithTimestamp);

      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject("Error saving report");
    };

    request.onerror = () => reject("Error opening database for saving report");
  });
};

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

export const getLastMemory = (studentId: string): Promise<string | null> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const tx = db.transaction([STORE_REPORTS], 'readonly');
      const store = tx.objectStore(STORE_REPORTS);
      const getAll = store.getAll();

      getAll.onsuccess = () => {
        const reports = getAll.result as (TeacherReport & { createdAt: number })[];
        // Filter by student and sort by newest
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