import express from 'express';
import * as e2e from '../controllers/e2eController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
router.post('/keys', protect, e2e.publishKeys);
router.get('/keys/status', protect, e2e.getKeyStatus);
router.get('/prekey-bundle/:userId', protect, e2e.getPreKeyBundle);

export default router;
