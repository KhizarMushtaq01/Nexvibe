import express from 'express';
import * as admin from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();
const isAdmin = [protect, authorize('admin', 'moderator')];
const adminOnly = [protect, authorize('admin')];

router.get('/dashboard', ...isAdmin, admin.getDashboardStats);
router.get('/users', ...isAdmin, admin.getAllUsers);
router.get('/users/:id', ...isAdmin, admin.getAdminUser);
router.post('/users/:id/ban', ...isAdmin, admin.banUser);
router.post('/users/:id/unban', ...isAdmin, admin.unbanUser);
router.post('/users/:id/verify', ...isAdmin, admin.verifyUser);
router.put('/users/:id/role', ...adminOnly, admin.changeUserRole);
router.delete('/users/:id', ...adminOnly, admin.deleteUserAdmin);
router.get('/posts', ...isAdmin, admin.getAllPosts);
router.delete('/posts/:id', ...isAdmin, admin.deletePostAdmin);
router.post('/notifications/send', ...isAdmin, admin.sendSystemNotification);
router.get('/reports', ...isAdmin, admin.getReports);
router.post('/reports/resolve', ...isAdmin, admin.resolveReport);
export default router;
