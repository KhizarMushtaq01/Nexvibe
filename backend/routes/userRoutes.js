import express from 'express';
import * as user from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

router.get('/suggestions', protect, user.getSuggestions);
router.get('/blocked', protect, user.getBlockedUsers);
router.get('/follow-requests', protect, user.getFollowRequests);
router.put('/profile', protect, user.updateProfile);
router.put('/username', protect, user.updateUsername);
router.put('/avatar', protect, upload.single('avatar'), user.updateAvatar);
router.delete('/avatar', protect, user.deleteAvatar);
router.put('/cover', protect, upload.single('cover'), user.updateCoverPhoto);
router.put('/account-type', protect, user.updateAccountType);
router.put('/settings/privacy', protect, user.updatePrivacySettings);
router.put('/settings/notifications', protect, user.updateNotificationSettings);
router.post('/deactivate', protect, user.deactivateAccount);
router.delete('/delete-account', protect, user.deleteAccount);
router.post('/change-email/request', protect, user.requestEmailChange);
router.post('/change-email/confirm', protect, user.confirmEmailChange);
router.delete('/followers/:id/remove', protect, user.removeFollower);

router.get('/:username', protect, user.getUserProfile);
router.post('/:id/follow', protect, user.followUser);
router.post('/follow-requests/:requesterId/respond', protect, user.respondFollowRequest);
router.post('/:id/block', protect, user.blockUser);
router.post('/:id/mute', protect, user.muteUser);
router.post('/:id/restrict', protect, user.restrictUser);
router.post('/:id/close-friend', protect, user.toggleCloseFriend);
router.get('/:id/followers', protect, user.getFollowers);
router.get('/:id/following', protect, user.getFollowing);

export default router;
