import express from 'express';
import { getStudyDiscussions, addStudyDiscussion, deleteStudyDiscussion } from '../controllers/discussion.controller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get all discussions for a study
router.get('/studies/:studyId/discussions', protect, getStudyDiscussions);

// Add a new discussion to a study
router.post('/studies/:studyId/discussions', protect, addStudyDiscussion);

// Delete a discussion from a study (admin only)
router.delete('/studies/:studyId/discussions/:discussionId', protect, deleteStudyDiscussion);

export default router;