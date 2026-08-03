import express from 'express';
import * as search from '../controllers/searchController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
const router = express.Router();
router.get('/', optionalAuth, search.search);
router.get('/suggestions', optionalAuth, search.getSearchSuggestions);
export default router;
