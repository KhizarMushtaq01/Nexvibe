import User from '../models/User.js';

// Server-side view of a user's one-time prekey pool. `remaining` is the number
// of prekeys still available to hand out; `maxKeyId` is the highest keyId the
// server has ever stored (used or not) so a client generating a new batch can
// avoid re-using a keyId the server still holds.
const preKeyPoolStatus = (e2e) => {
  const keys = e2e?.oneTimePreKeys || [];
  return {
    remaining: keys.filter(k => !k.used).length,
    maxKeyId: keys.reduce((max, k) => Math.max(max, k.keyId || 0), 0)
  };
};

// @desc    Publish this device's identity key and a batch of one-time prekeys
// @route   POST /api/e2e/keys
export const publishKeys = async (req, res) => {
  try {
    const { identityKey, oneTimePreKeys } = req.body;
    if (!identityKey || typeof identityKey !== 'string') {
      return res.status(400).json({ success: false, message: 'identityKey is required' });
    }
    if (!Array.isArray(oneTimePreKeys)) {
      return res.status(400).json({ success: false, message: 'oneTimePreKeys must be an array' });
    }

    const user = await User.findById(req.user._id);
    user.e2e = user.e2e || { identityKey: undefined, oneTimePreKeys: [] };
    user.e2e.identityKey = identityKey;
    user.e2e.oneTimePreKeys.push(
      ...oneTimePreKeys.map(k => ({ keyId: k.keyId, publicKey: k.publicKey, used: false }))
    );
    await user.save();

    // Report the server-side pool back so the client can reconcile: prekeys are
    // marked used when a bundle is SERVED, which the publishing client never
    // observes locally (it only deletes a local private half when a handshake
    // naming that keyId actually arrives).
    res.json({ success: true, message: 'Keys published', ...preKeyPoolStatus(user.e2e) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Report this user's own server-side one-time prekey pool status
// @route   GET /api/e2e/keys/status
export const getKeyStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('e2e');
    res.json({
      success: true,
      hasIdentityKey: !!user?.e2e?.identityKey,
      ...preKeyPoolStatus(user?.e2e)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Fetch a prekey bundle to start a session with a user
// @route   GET /api/e2e/prekey-bundle/:userId
export const getPreKeyBundle = async (req, res) => {
  try {
    const target = await User.findById(req.params.userId).select('e2e');
    if (!target || !target.e2e?.identityKey) {
      return res.status(404).json({ success: false, message: 'User has not published encryption keys yet' });
    }

    const claimed = await User.findOneAndUpdate(
      { _id: req.params.userId, 'e2e.oneTimePreKeys.used': false },
      { $set: { 'e2e.oneTimePreKeys.$.used': true } },
      { new: false }
    ).select('e2e');

    let oneTimePreKey = null;
    if (claimed) {
      const unused = claimed.e2e.oneTimePreKeys.find(k => !k.used);
      if (unused) oneTimePreKey = { keyId: unused.keyId, publicKey: unused.publicKey };
    }

    res.json({
      success: true,
      identityKey: target.e2e.identityKey,
      oneTimePreKey
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};
