import User from '../models/User.js';

// Private accounts the viewer doesn't own and doesn't already follow --
// their content must be excluded from any "discover" style query
// (explore, hashtags, reels feed, search) regardless of a given post's own
// `visibility` field, since that field is never auto-synced to the
// author's `isPrivate` flag.
export const getHiddenPrivateAuthorIds = async (viewer) => {
  // optionalAuth routes may have no viewer at all -- an anonymous request
  // sees no private accounts' content, same as a viewer following no one.
  const visibleIds = viewer ? [viewer._id, ...(viewer.following || [])] : [];
  return User.find({ isPrivate: true, _id: { $nin: visibleIds } }).distinct('_id');
};
