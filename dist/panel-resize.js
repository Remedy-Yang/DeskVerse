const STORAGE_KEY = 'deskverse.assets-width';
const MIN_WIDTH = 280;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 320;

export function initPanelResize({ panel, handle }) {
  const root = document.documentElement;
  let preferredWidth = DEFAULT_WIDTH;
  let width = DEFAULT_WIDTH;
  let pointerId = null;
  let startX = 0;
  let startWidth = 0;

  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH) preferredWidth = saved;
  } catch {
    // 禁用本地存储时仍可在本次会话调整。
  }

  function maximumWidth() {
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor((root.clientWidth - 32) / 2)));
  }

  function applyWidth(value) {
    width = Math.round(Math.max(MIN_WIDTH, Math.min(maximumWidth(), value)));
    root.style.setProperty('--assets-width', `${width}px`);
    handle.setAttribute('aria-valuemin', String(MIN_WIDTH));
    handle.setAttribute('aria-valuemax', String(maximumWidth()));
    handle.setAttribute('aria-valuenow', String(width));
    handle.setAttribute('aria-valuetext', `资产面板宽度 ${width} 像素`);
  }

  function rememberWidth() {
    preferredWidth = width;
    try {
      localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      // 存储不可用不影响拖拽和键盘操作。
    }
  }

  function isAvailable() {
    return root.clientWidth > 600 && !document.body.classList.contains('is-focused') && getComputedStyle(panel).display !== 'none';
  }

  function finishDrag() {
    if (pointerId === null) return;
    const capturedPointer = pointerId;
    pointerId = null;
    document.body.classList.remove('is-resizing-assets');
    if (handle.hasPointerCapture(capturedPointer)) handle.releasePointerCapture(capturedPointer);
    rememberWidth();
  }

  function onPointerDown(event) {
    if (event.button !== 0 || !event.isPrimary || pointerId !== null || !isAvailable()) return;
    event.preventDefault();
    event.stopPropagation();
    pointerId = event.pointerId;
    startX = event.clientX;
    startWidth = panel.getBoundingClientRect().width;
    handle.setPointerCapture(pointerId);
    handle.focus({ preventScroll: true });
    document.body.classList.add('is-resizing-assets');
  }

  function onPointerMove(event) {
    if (event.pointerId !== pointerId) return;
    if (!isAvailable()) {
      finishDrag();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    applyWidth(startWidth + event.clientX - startX);
  }

  function onPointerEnd(event) {
    if (event.pointerId !== pointerId) return;
    event.stopPropagation();
    finishDrag();
  }

  function onKeyDown(event) {
    if (event.target !== handle || !isAvailable() || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    let nextWidth;
    switch (event.key) {
      case 'ArrowLeft': nextWidth = width - 10; break;
      case 'ArrowRight': nextWidth = width + 10; break;
      case 'Home': nextWidth = MIN_WIDTH; break;
      case 'End': nextWidth = maximumWidth(); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    applyWidth(nextWidth);
    rememberWidth();
  }

  function onResize() {
    finishDrag();
    applyWidth(preferredWidth);
  }

  handle.classList.add('assets-resizer');
  handle.setAttribute('aria-label', '调整资产面板宽度');
  handle.setAttribute('title', '拖动调整宽度；方向键微调，Home 最窄，End 最宽');
  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerEnd);
  handle.addEventListener('pointercancel', onPointerEnd);
  handle.addEventListener('lostpointercapture', onPointerEnd);
  handle.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', finishDrag);
  applyWidth(preferredWidth);

  return function dispose() {
    finishDrag();
    handle.removeEventListener('pointerdown', onPointerDown);
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerEnd);
    handle.removeEventListener('pointercancel', onPointerEnd);
    handle.removeEventListener('lostpointercapture', onPointerEnd);
    handle.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('blur', finishDrag);
  };
}
