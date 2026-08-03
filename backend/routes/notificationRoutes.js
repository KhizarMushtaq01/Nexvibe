import express from 'express';
import * as notif from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
router.get('/', protect, notif.getNotifications);
router.get('/unread-count', protect, notif.getUnreadCount);
router.post('/mark-all-read', protect, notif.markAllRead);
router.post('/clear', protect, notif.clearAllNotifications);
router.put('/:id/read', protect, notif.markRead);
router.delete('/:id', protect, notif.deleteNotification);
export default router;
