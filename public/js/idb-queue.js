/* IndexedDB offline queue — Phase 6 PWA */

const IDB_NAME = 'laburgertory-offline';
const IDB_VERSION = 1;
const STORE_ORDERS = 'pending-orders';
const STORE_STATUS = 'pending-status';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_ORDERS)) {
        db.createObjectStore(STORE_ORDERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_STATUS)) {
        db.createObjectStore(STORE_STATUS, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// Queue an order for later sync
async function queueOrder(orderData) {
  await idbPut(STORE_ORDERS, { ...orderData, _queued_at: new Date().toISOString() });
}

// Queue a status change
async function queueStatusChange(orderId, status) {
  await idbPut(STORE_STATUS, { orderId, status, _queued_at: new Date().toISOString() });
}

// Attempt to sync all queued items to the server
async function syncQueue() {
  if (!navigator.onLine) return;

  // Sync pending orders
  const pendingOrders = await idbGetAll(STORE_ORDERS);
  for (const order of pendingOrders) {
    try {
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
        credentials: 'same-origin',
      });
      await idbDelete(STORE_ORDERS, order.id);
    } catch {
      // Will retry next sync
    }
  }

  // Sync pending status changes
  const pendingStatuses = await idbGetAll(STORE_STATUS);
  for (const change of pendingStatuses) {
    try {
      await fetch(`/api/orders/${change.orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: change.status }),
        credentials: 'same-origin',
      });
      await idbDelete(STORE_STATUS, change.id);
    } catch {
      // Will retry
    }
  }

  const total = pendingOrders.length + pendingStatuses.length;
  if (total > 0) {
    console.log(`[IDB Sync] Synced ${total} queued items`);
  }
}

// Auto-sync when coming back online
window.addEventListener('online', () => {
  setTimeout(syncQueue, 1000); // small delay to let connection stabilize
});

// Sync on page load
window.addEventListener('load', () => setTimeout(syncQueue, 2000));
