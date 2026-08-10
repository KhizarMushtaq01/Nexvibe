export function createLongPressHandlers(onLongPress, { delay = 500, moveThreshold = 10 } = {}) {
  let timer = null;
  let startX = 0;
  let startY = 0;

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const start = (x, y) => {
    clear();
    startX = x;
    startY = y;
    timer = setTimeout(() => {
      timer = null;
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
    onTouchEnd: clear,
    onMouseDown: (e) => start(e.clientX, e.clientY),
    onMouseMove: (e) => moved(e.clientX, e.clientY),
    onMouseUp: clear,
    onMouseLeave: clear
  };
}
