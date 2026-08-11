// Tracks who is in which call, in memory. Deliberately not in MongoDB: a
// call cannot outlive the process that is relaying its signaling anyway, so
// persisting it would only create rows nobody can act on. The trade-off is
// that a server restart drops in-flight calls, and this does not span
// multiple server instances -- a Redis adapter is the scale-out path.

export const MAX_CALL_PARTICIPANTS = 8;

export const createCallRegistry = () => {
  /** @type {Map<string, Set<string>>} callId -> member user ids */
  const calls = new Map();

  const has = (callId) => calls.has(callId);

  const members = (callId) => [...(calls.get(callId) || [])];

  const isMember = (callId, userId) => !!calls.get(callId)?.has(String(userId));

  const create = (callId, userIds) => {
    const unique = [...new Set(userIds.map(String))].slice(0, MAX_CALL_PARTICIPANTS);
    calls.set(callId, new Set(unique));
  };

  const join = (callId, userId) => {
    const set = calls.get(callId);
    if (!set) return false;
    const id = String(userId);
    if (set.has(id)) return true;
    if (set.size >= MAX_CALL_PARTICIPANTS) return false;
    set.add(id);
    return true;
  };

  const leave = (callId, userId) => {
    const set = calls.get(callId);
    if (!set) return [];
    set.delete(String(userId));
    if (set.size === 0) { calls.delete(callId); return []; }
    return [...set];
  };

  // A socket disconnect gives us a user id and nothing else, so every call
  // they might have been in has to be swept.
  const leaveAll = (userId) => {
    const id = String(userId);
    const affected = [];
    for (const [callId, set] of [...calls.entries()]) {
      if (!set.has(id)) continue;
      affected.push({ callId, remaining: leave(callId, id) });
    }
    return affected;
  };

  return { create, join, leave, members, isMember, leaveAll, has };
};
