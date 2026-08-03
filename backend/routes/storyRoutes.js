import express from 'express';
import * as story from '../controllers/storyController.js';
import { protect } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();
router.get('/', protect, story.getStories);
router.post('/', protect, upload.single('media'), story.createStory);
router.get('/archived', protect, story.getArchivedStories);
router.post('/:id/view', protect, story.viewStory);
router.post('/:id/reply', protect, story.replyToStory);
router.post('/:id/react', protect, story.reactToStory);
router.delete('/:id', protect, story.deleteStory);
router.get('/:id/viewers', protect, story.getStoryViewers);
router.post('/:id/archive', protect, story.archiveStory);
router.post('/:id/highlight', protect, story.addToHighlight);
export default router;
