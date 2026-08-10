import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLongPressHandlers } from './longPress.js';

describe('createLongPressHandlers', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires onLongPress after the delay on touch', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500 });

    handlers.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    expect(onLongPress).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('fires onLongPress after the delay on mouse', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500 });

    handlers.onMouseDown({ clientX: 0, clientY: 0 });
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire if released before the delay', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500 });

    handlers.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    vi.advanceTimersByTime(300);
    handlers.onTouchEnd();
    vi.advanceTimersByTime(300);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels if the touch moves past the threshold before the delay', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500, moveThreshold: 10 });

    handlers.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    handlers.onTouchMove({ touches: [{ clientX: 20, clientY: 0 }] });
    vi.advanceTimersByTime(500);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not cancel for small movement within the threshold', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500, moveThreshold: 10 });

    handlers.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    handlers.onTouchMove({ touches: [{ clientX: 3, clientY: 3 }] });
    vi.advanceTimersByTime(500);

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('cancels on mouse leave', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500 });

    handlers.onMouseDown({ clientX: 0, clientY: 0 });
    handlers.onMouseLeave();
    vi.advanceTimersByTime(500);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('calls preventDefault on touchend when the long-press already fired', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500 });

    handlers.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    const preventDefault = vi.fn();
    handlers.onTouchEnd({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('does not call preventDefault on touchend when the long-press had not fired', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500 });

    handlers.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    vi.advanceTimersByTime(300);

    const preventDefault = vi.fn();
    handlers.onTouchEnd({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
