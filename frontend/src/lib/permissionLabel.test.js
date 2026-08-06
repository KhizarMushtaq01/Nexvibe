import { describe, it, expect } from 'vitest';
import { permissionLabel } from './permissionLabel.js';

describe('permissionLabel', () => {
  it('maps granted to Allowed', () => {
    expect(permissionLabel('granted').text).toBe('Allowed');
  });

  it('maps denied to Blocked', () => {
    expect(permissionLabel('denied').text).toBe('Blocked');
  });

  it('maps prompt to Not asked', () => {
    expect(permissionLabel('prompt').text).toBe('Not asked');
  });

  it('falls back to Not supported for an unknown state', () => {
    expect(permissionLabel('bogus').text).toBe('Not supported');
  });

  it('falls back to Not supported when called with no argument', () => {
    expect(permissionLabel().text).toBe('Not supported');
  });
});
