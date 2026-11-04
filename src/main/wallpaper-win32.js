import koffi from 'koffi';
import { Worker } from 'worker_threads';

// Load User32.dll
const user32 = koffi.load('user32.dll');

// Type aliases
const HWND = koffi.alias('HWND', 'void*');
const BOOL = koffi.alias('BOOL', 'int');
const UINT = koffi.alias('UINT', 'uint');
const LPARAM = koffi.alias('LPARAM', 'intptr_t');
const WPARAM = koffi.alias('WPARAM', 'uintptr_t');

// Win32 APIs
const FindWindowW = user32.func('HWND __stdcall FindWindowW(str16, str16)');
const FindWindowExW = user32.func('HWND __stdcall FindWindowExW(HWND, HWND, str16, str16)');
const SendMessageTimeoutW = user32.func('long __stdcall SendMessageTimeoutW(HWND, UINT, WPARAM, LPARAM, UINT, UINT, _Out_ uintptr_t*)');
const SetParent = user32.func('intptr_t __stdcall SetParent(intptr_t, intptr_t)');
const SetWindowPos = user32.func('BOOL __stdcall SetWindowPos(intptr_t, intptr_t, int, int, int, int, UINT)');
const SetWindowLongPtrW = user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t, int, intptr_t)');
const GetWindowLongPtrW = user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t, int)');
const GetParent = user32.func('intptr_t __stdcall GetParent(intptr_t)');
const GetAncestor = user32.func('intptr_t __stdcall GetAncestor(intptr_t, uint)');
const IsWindow = user32.func('BOOL __stdcall IsWindow(intptr_t)');
const POINT = koffi.struct('POINT', { x: 'long', y: 'long' });
const GetCursorPos = user32.func('BOOL __stdcall GetCursorPos(_Out_ POINT* pt)');
const GetAsyncKeyState = user32.func('short __stdcall GetAsyncKeyState(int vKey)');

const WNDENUMPROC = koffi.proto('bool __stdcall WNDENUMPROC(HWND, intptr_t)');
const EnumWindows = user32.func('BOOL __stdcall EnumWindows(WNDENUMPROC*, intptr_t)');

// Win32 constants
const GWL_STYLE = -16;
const GA_PARENT = 1;
const WS_CHILD = 0x40000000;
const WS_VISIBLE = 0x10000000;
const WS_POPUP = 0x80000000;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const SWP_SHOWWINDOW = 0x0040;

let workerWHwnd = null;
let mouseInterval = null;
let originalStyle = null;

/**
 * Direct search on the calling thread.
 */
function findWorkerWDirect() {
  const progman = FindWindowW('Progman', null);
  if (!progman) return null;

  const res = [0];
  SendMessageTimeoutW(progman, 0x052c, 0, 0, 0, 1000, res);

  let target = null;
  const enumCallback = koffi.register((hwnd) => {
    const defView = FindWindowExW(hwnd, null, 'SHELLDLL_DefView', null);
    if (defView) {
      const nextWorker = FindWindowExW(null, hwnd, 'WorkerW', null);
      target = nextWorker || hwnd;
      return false;
    }
    return true;
  }, koffi.pointer(WNDENUMPROC));

  EnumWindows(enumCallback, 0);
  return target ? BigInt(koffi.address(target)) : null;
}

/**
 * Searches for WorkerW using a worker thread if the UI thread is isolated.
 */
export async function findWorkerWAsync() {
  const direct = findWorkerWDirect();
  if (direct) {
    workerWHwnd = direct;
    return direct;
  }

  // Fallback to Worker thread for desktop context switching
  return new Promise((resolve) => {
    const workerScript = `
      import { parentPort } from 'worker_threads';
      import koffi from 'koffi';
      const user32 = koffi.load('user32.dll');
      const OpenInputDesktop = user32.func('void* __stdcall OpenInputDesktop(uint, bool, uint)');
      const SetThreadDesktop = user32.func('int __stdcall SetThreadDesktop(void*)');
      const FindWindowW = user32.func('void* __stdcall FindWindowW(str16, str16)');
      const FindWindowExW = user32.func('void* __stdcall FindWindowExW(void*, void*, str16, str16)');
      const SendMessageTimeoutW = user32.func('long __stdcall SendMessageTimeoutW(void*, uint, uintptr_t, intptr_t, uint, uint, _Out_ uintptr_t*)');
      const WNDENUMPROC = koffi.proto('bool __stdcall WNDENUMPROC(void*, intptr_t)');
      const EnumWindows = user32.func('int __stdcall EnumWindows(WNDENUMPROC*, intptr_t)');

      const hInput = OpenInputDesktop(0, false, 0x1ff);
      if (hInput) SetThreadDesktop(hInput);

      const progman = FindWindowW('Progman', null);
      if (!progman) {
        parentPort.postMessage({ workerW: null });
        process.exit(0);
      }

      let res = [0];
      SendMessageTimeoutW(progman, 0x052c, 0, 0, 0, 1000, res);

      let target = null;
      const callback = koffi.register((hwnd) => {
        const defView = FindWindowExW(hwnd, null, 'SHELLDLL_DefView', null);
        if (defView) {
          const nextWorker = FindWindowExW(null, hwnd, 'WorkerW', null);
          target = nextWorker || hwnd;
          return false;
        }
        return true;
      }, koffi.pointer(WNDENUMPROC));

      EnumWindows(callback, 0);
      parentPort.postMessage({ workerW: target ? target.toString() : null });
    `;

    try {
      const w = new Worker(workerScript, { eval: true });
      w.on('message', (msg) => {
        if (msg.workerW) {
          workerWHwnd = BigInt(msg.workerW);
          resolve(workerWHwnd);
        } else {
          resolve(null);
        }
      });
      w.on('error', (err) => {
        console.warn('[LiveWP] Worker thread error:', err);
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Convert Electron native buffer handle to 64-bit intptr BigInt
 */
export function getHwndFromBuffer(buffer) {
  if (Buffer.isBuffer(buffer)) {
    return buffer.readBigUInt64LE(0);
  }
  return BigInt(buffer);
}

/**
 * Reparent Electron window behind desktop icons.
 */
export async function attachToWallpaper(electronHwndBuf, bounds) {
  try {
    const hwnd = getHwndFromBuffer(electronHwndBuf);

    // If already attached to WorkerW, do NOT re-parent or cause desktop flashes!
    if (isAttached(electronHwndBuf)) {
      return true;
    }

    const workerW = await findWorkerWAsync();

    if (!workerW) {
      console.warn('[LiveWP] Could not locate WorkerW, running in desktop overlay mode.');
      return false;
    }

    // Save original style
    originalStyle = GetWindowLongPtrW(hwnd, GWL_STYLE);

    // Reparent window to WorkerW
    SetParent(hwnd, workerW);

    // Set child & visible styles
    SetWindowLongPtrW(hwnd, GWL_STYLE, BigInt(WS_CHILD | WS_VISIBLE));

    // Apply dimensions & position
    SetWindowPos(
      hwnd,
      0n,
      bounds.x || 0,
      bounds.y || 0,
      bounds.width || 1920,
      bounds.height || 1080,
      SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED
    );

    console.log('[LiveWP] Attached to WorkerW (' + workerW + ') successfully!');
    return true;
  } catch (err) {
    console.error('[LiveWP] Error attaching to wallpaper:', err);
    return false;
  }
}

/**
 * Checks whether the window is currently attached to a live WorkerW parent.
 */
export function isAttached(electronHwndBuf) {
  if (!workerWHwnd) return false;
  try {
    const hwnd = getHwndFromBuffer(electronHwndBuf);
    const p1 = GetParent(hwnd);
    const p2 = GetAncestor(hwnd, GA_PARENT);
    const target = BigInt(workerWHwnd);
    const matches = (p1 && BigInt(p1) === target) || (p2 && BigInt(p2) === target);
    return matches && IsWindow(workerWHwnd) !== 0;
  } catch {
    return false;
  }
}

/**
 * Detach window from WorkerW back to standard window.
 */
export function detachFromWallpaper(electronHwndBuf, bounds) {
  try {
    const hwnd = getHwndFromBuffer(electronHwndBuf);
    SetParent(hwnd, 0n);
    workerWHwnd = null;

    const style = originalStyle || BigInt(WS_POPUP | WS_VISIBLE);
    SetWindowLongPtrW(hwnd, GWL_STYLE, style);

    SetWindowPos(
      hwnd,
      0n,
      bounds.x || 100,
      bounds.y || 100,
      bounds.width || 1280,
      bounds.height || 720,
      SWP_SHOWWINDOW | SWP_FRAMECHANGED
    );

    console.log('[LiveWP] Detached from WorkerW');
    return true;
  } catch (err) {
    console.error('[LiveWP] Error detaching from wallpaper:', err);
    return false;
  }
}

/**
 * Global background cursor & mouse button tracker.
 */
export function startMouseTracking(webContents, getBounds) {
  if (mouseInterval) clearInterval(mouseInterval);

  let lastX = -9999;
  let lastY = -9999;
  let lastLeft = false;
  let lastRight = false;

  const pt = { x: 0, y: 0 };

  mouseInterval = setInterval(() => {
    if (!webContents || webContents.isDestroyed()) return;

    GetCursorPos(pt);
    const leftDown = (GetAsyncKeyState(0x01) & 0x8000) !== 0;
    const rightDown = (GetAsyncKeyState(0x02) & 0x8000) !== 0;

    const bounds = getBounds ? getBounds() : { x: 0, y: 0, width: 1920, height: 1080 };
    const relX = pt.x - bounds.x;
    const relY = pt.y - bounds.y;

    if (relX !== lastX || relY !== lastY || leftDown !== lastLeft || rightDown !== lastRight) {
      lastX = relX;
      lastY = relY;
      lastLeft = leftDown;
      lastRight = rightDown;

      webContents.send('desktop-mouse', {
        x: relX,
        y: relY,
        leftDown,
        rightDown,
        screenX: pt.x,
        screenY: pt.y,
      });
    }
  }, 16);
}

export function stopMouseTracking() {
  if (mouseInterval) {
    clearInterval(mouseInterval);
    mouseInterval = null;
  }
}
