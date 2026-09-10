import type { DiskProject } from "./local-library";

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("blockout-v2-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recovery");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readDiskBaseline(): Promise<DiskProject | null> {
  const db = await database();
  try {
    const result = await new Promise<DiskProject | undefined>((resolve, reject) => {
      const request = db.transaction("recovery").objectStore("recovery").get("last-disk");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const legacy = localStorage.getItem("blockout-v2:last-disk");
    return result ?? (legacy ? JSON.parse(legacy) as DiskProject : null);
  } finally { db.close(); }
}

export async function writeDiskBaseline(value: DiskProject): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("recovery", "readwrite");
      transaction.objectStore("recovery").put(value, "last-disk");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
    localStorage.removeItem("blockout-v2:last-disk");
  } finally { db.close(); }
}
