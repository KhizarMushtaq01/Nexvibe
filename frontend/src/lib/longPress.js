export function createLongPressHandlers(onLongPress, { delay = 500, moveThreshold = 10 } = {}) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let fired = false;

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const start = (x, y) => {
    clear();
    fired = false;
    startX = x;
    startY = y;
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      onLongPress();
    }, delay);
  };

  const moved = (x, y) => {
    if (!timer) return;
    const dx = Math.abs(x - startX);
    const dy = Math.abs(y - startY);
    if (dx > moveThreshold || dy > moveThreshold) clear();
  };

  return {
    onTouchStart: (e) => {
      const touch = e.touches[0];
      start(touch.clientX, touch.clientY);
    },
    onTouchMove: (e) => {
      const touch = e.touches[0];
      moved(touch.clientX, touch.clientY);
    },
    onTouchEnd: (e) => {
      clear();
      if (fired) {
        e.preventDefault();
        fired = false;
      }
    },
    onMouseDown: (e) => start(e.clientX, e.clientY),
    onMouseMove: (e) => moved(e.clientX, e.clientY),
    onMouseUp: clear,
    onMouseLeave: clear,
    // Mouse has no equivalent of touch's preventDefault-on-touchend trick:
    // calling preventDefault() on a real mouseup does NOT stop the browser
    // from firing the subsequent click. So the click handler has to ask
    // whether the click it just received is the tail of a long-press that
    // already fired, and ignore it if so. Returns true exactly once per
    // fired long-press.
    consumeSuppressedClick: () => {
      if (fired) {
        fired = false;
        return true;
      }
      return false;
    }
  };
}
