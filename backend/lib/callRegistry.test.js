import { describe, it, expect, beforeEach } from 'vitest';
import { createCallRegistry, MAX_CALL_PARTICIPANTS } from './callRegistry.js';

describe('callRegistry', () => {
  let registry;
  beforeEach(() => { registry = createCallRegistry(); });

  it('reports no members for a call that was never created', () => {
    expect(registry.has('nope')).toBe(false);
    expect(registry.members('nope')).toEqual([]);
    expect(registry.isMember('nope', 'a')).toBe(false);
  });

  it('creates a call with its initial members', () => {
    registry.create('c1', ['a', 'b']);
    expect(registry.has('c1')).toBe(true);
    expect(registry.members('c1').sort()).toEqual(['a', 'b']);
    expect(registry.isMember('c1', 'a')).toBe(true);
    expect(registry.isMember('c1', 'z')).toBe(false);
  });

  it('caps a created call at MAX_CALL_PARTICIPANTS', () => {
    const many = Array.from({ length: 20 }, (_, i) => `u${i}`);
    registry.create('c1', many);
    expect(registry.members('c1')).toHaveLength(MAX_CALL_PARTICIPANTS);
  });

  it('de-duplicates members', () => {
    registry.create('c1', ['a', 'a', 'b']);
    expect(registry.members('c1').sort()).toEqual(['a', 'b']);
  });

  it('refuses to join a call that does not exist', () => {
    expect(registry.join('ghost', 'a')).toBe(false);
  });

  it('refuses to join a full call', () => {
    registry.create('c1', Array.from({ length: MAX_CALL_PARTICIPANTS }, (_, i) => `u${i}`));
    expect(registry.join('c1', 'extra')).toBe(false);
    expect(registry.isMember('c1', 'extra')).toBe(false);
  });

  it('joining twice is idempotent and still succeeds', () => {
    registry.create('c1', ['a']);
    expect(registry.join('c1', 'b')).toBe(true);
    expect(registry.join('c1', 'b')).toBe(true);
    expect(registry.members('c1')).toHaveLength(2);
  });

  it('returns the remaining members on leave', () => {
    registry.create('c1', ['a', 'b', 'c']);
    expect(registry.leave('c1', 'b').sort()).toEqual(['a', 'c']);
  });

  it('deletes the call once the last member leaves, so the map cannot leak', () => {
    registry.create('c1', ['a']);
    expect(registry.leave('c1', 'a')).toEqual([]);
    expect(registry.has('c1')).toBe(false);
  });

  it('leaving a call you are not in is a harmless no-op', () => {
    registry.create('c1', ['a']);
    expect(registry.leave('c1', 'z').sort()).toEqual(['a']);
    expect(registry.leave('ghost', 'a')).toEqual([]);
  });

  it('leaveAll removes a disconnecting user from every call they were in', () => {
    registry.create('c1', ['a', 'b']);
    registry.create('c2', ['a', 'c']);
    registry.create('c3', ['b', 'c']);

    const affected = registry.leaveAll('a');

    expect(affected.map(x => x.callId).sort()).toEqual(['c1', 'c2']);
    expect(registry.isMember('c1', 'a')).toBe(false);
    expect(registry.isMember('c2', 'a')).toBe(false);
    expect(registry.members('c3').sort()).toEqual(['b', 'c']);
  });

  it('leaveAll reports the remaining members so the server knows who to notify', () => {
    registry.create('c1', ['a', 'b', 'c']);
    const [entry] = registry.leaveAll('a');
    expect(entry.remaining.sort()).toEqual(['b', 'c']);
  });

  it('coerces ObjectId-like ids to strings', () => {
    registry.create('c1', [{ toString: () => 'a' }]);
    expect(registry.isMember('c1', 'a')).toBe(true);
  });
});
