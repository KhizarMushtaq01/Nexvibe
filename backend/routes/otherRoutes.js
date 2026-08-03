// notificationRoutes.js
import express from 'express';
import * as notif from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';
export const notifRouter = express.Router();
notifRouter.get('/', protect, notif.getNotifications);
notifRouter.get('/unread-count', protect, notif.getUnreadCount);
notifRouter.post('/mark-all-read', protect, notif.markAllRead);
notifRouter.post('/clear', protect, notif.clearAllNotifications);
notifRouter.put('/:id/read', protect, notif.markRead);
notifRouter.delete('/:id', protect, notif.deleteNotification);

// adminRoutes.js
import expressA from 'express';
import * as admin from '../controllers/adminController.js';
import { protect as protectA, authorize } from '../middleware/authMiddleware.js';
export const adminRouter = expressA.Router();
const isAdmin = [protectA, authorize('admin')];
adminRouter.get('/dashboard', ...isAdmin, admin.getDashboardStats);
adminRouter.get('/users', ...isAdmin, admin.getAllUsers);
adminRouter.get('/users/:id', ...isAdmin, admin.getAdminUser);
adminRouter.post('/users/:id/ban', ...isAdmin, admin.banUser);
adminRouter.post('/users/:id/unban', ...isAdmin, admin.unbanUser);
adminRouter.post('/users/:id/verify', ...isAdmin, admin.verifyUser);
adminRouter.put('/users/:id/role', ...isAdmin, admin.changeUserRole);
adminRouter.delete('/users/:id', ...isAdmin, admin.deleteUserAdmin);
adminRouter.get('/posts', ...isAdmin, admin.getAllPosts);
adminRouter.delete('/posts/:id', ...isAdmin, admin.deletePostAdmin);
adminRouter.post('/notifications/send', ...isAdmin, admin.sendSystemNotification);

// searchRoutes.js
import expressS from 'express';
import * as search from '../controllers/searchController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
export const searchRouter = expressS.Router();
searchRouter.get('/', optionalAuth, search.search);
searchRouter.get('/suggestions', optionalAuth, search.getSearchSuggestions);

// reelRoutes.js - reuses post controller with type filter
import expressR from 'express';
import * as postCtrl from '../controllers/postController.js';
import { protect as protectR } from '../middleware/authMiddleware.js';
import { upload as uploadR } from '../middleware/upload.js';
export const reelRouter = expressR.Router();
reelRouter.get('/feed', protectR, (req, res, next) => { req.query.type = 'reel'; next(); }, postCtrl.getFeed);
reelRouter.post('/', protectR, uploadR.single('media'), (req, res, next) => { req.body.type = 'reel'; next(); }, postCtrl.createPost);
