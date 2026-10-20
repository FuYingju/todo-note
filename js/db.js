/**
 * 本地数据存储层
 * 通过 File System Access API 将数据以 data.json 真实落盘到用户授权的本地目录（如 D:\work\todo-note）。
 * 目录句柄缓存在 IndexedDB，下次打开页面优先恢复并重新校验授权，无需每次重新选择文件夹。
 * 仅支持 Chromium 内核浏览器（Chrome / Edge）。
 */

window.DB = (() => {
  const DATA_FILE = 'data.json';
  const HANDLE_DB = 'todo_note_handles';
  const HANDLE_KEY = 'dirHandle';

  // 默认数据：内置"默认分组"，未分组的待办归入该组；scratch 为左侧便签内容
  function defaultData() {
    return {
      version: 1,
      groups: [{ id: 'g_default', name: '默认分组', builtin: true }],
      todos: [],
      memos: [],
      scratch: '',
      lastGroupId: '',
    };
  }

  // ---- 目录句柄缓存（IndexedDB） ----
  function openHandleDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HANDLE_DB, 1);
      req.onupgradeneeded = (e) => e.target.result.createObjectStore('handles');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveHandle(handle) {
    const db = await openHandleDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadHandle() {
    const db = await openHandleDb();
    return new Promise((resolve) => {
      const req = db.transaction('handles', 'readonly').objectStore('handles').get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  // ---- 目录授权 ----
  // 返回一个已具备 readwrite 权限的目录句柄；每次打开页面需要用户在浏览器弹窗中确认一次
  async function authorize() {
    let dir = await loadHandle();
    if (dir) {
      let perm = await dir.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        perm = await dir.requestPermission({ mode: 'readwrite' });
      }
      if (perm === 'granted') return dir;
    }
    dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveHandle(dir);
    return dir;
  }

  // 检查当前环境是否支持 File System Access API
  function supported() {
    return typeof window !== 'undefined' && !!window.showDirectoryPicker;
  }

  // 静默恢复上次授权的目录句柄；已具备 readwrite 权限则返回句柄，否则返回 null（不弹窗）
  async function restoreHandle() {
    const dir = await loadHandle();
    if (!dir) return null;
    const perm = await dir.queryPermission({ mode: 'readwrite' });
    return perm === 'granted' ? dir : null;
  }

  // 读取数据；目录无 data.json 时返回默认结构
  async function readData() {
    const dir = await authorize();
    return readWith(dir);
  }

  async function readWith(dir) {
    const fileHandle = await dir.getFileHandle(DATA_FILE, { create: true });
    const file = await fileHandle.getFile();
    const text = await file.text();
    return text ? JSON.parse(text) : defaultData();
  }

  // 整体写入数据
  async function writeData(data) {
    const dir = await authorize();
    return writeWith(dir, data);
  }

  async function writeWith(dir, data) {
    const fileHandle = await dir.getFileHandle(DATA_FILE, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }

  return { supported, authorize, restoreHandle, readData, readWith, writeData, writeWith, defaultData };
})();
