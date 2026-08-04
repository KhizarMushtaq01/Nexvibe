import User from '../models/User.js';

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

    res.json({ success: true, message: 'Keys published' });
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
