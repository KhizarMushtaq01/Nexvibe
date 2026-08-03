// postRoutes.js
import express from 'express';
import * as post from '../controllers/postController.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

router.get('/feed', protect, post.getFeed);
router.get('/explore', optionalAuth, post.getExplorePosts);
router.get('/saved', protect, post.getSavedPosts);
router.get('/archived', protect, post.getArchivedPosts);
router.get('/trending', post.getTrending);
router.get('/hashtag/:tag', optionalAuth, post.getHashtagPosts);
router.get('/user/:userId', optionalAuth, post.getUserPosts);
router.post('/', protect, upload.array('media', 10), post.createPost);
router.get('/:id', optionalAuth, post.getPost);
router.put('/:id', protect, post.updatePost);
router.delete('/:id', protect, post.deletePost);
router.post('/:id/like', protect, post.likePost);
router.post('/:id/save', protect, post.savePost);
router.post('/:id/archive', protect, post.archivePost);
router.post('/:id/pin', protect, post.pinPost);
router.post('/:id/comments', protect, post.addComment);
router.post('/:id/comments/:commentId/reply', protect, post.replyToComment);
router.delete('/:id/comments/:commentId', protect, post.deleteComment);
router.post('/:id/comments/:commentId/like', protect, post.likeComment);
router.post('/:id/comments/:commentId/pin', protect, post.pinComment);

export default router;
