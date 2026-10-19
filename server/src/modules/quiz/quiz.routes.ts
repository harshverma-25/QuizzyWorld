import { Router } from 'express';
import { quizController } from './quiz.controller.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { quizGenerationRateLimiter } from '../../middleware/rate-limiter.middleware.js';

const router = Router();

// Public routes (accessible without login)
router.get('/public', quizController.getPublicQuizzes);
router.get('/share/:shareId', quizController.getSharedQuiz);

// Protected routes (require login)
router.get('/quota', authenticate, quizController.getQuotaStatus);
router.post('/generate', authenticate, quizGenerationRateLimiter, quizController.generateQuiz);
router.post('/thumbnail', authenticate, quizGenerationRateLimiter, quizController.processThumbnail);
router.post('/', authenticate, quizController.saveQuiz);
router.get('/my', authenticate, quizController.getMyQuizzes);
router.get('/:id', optionalAuthenticate, quizController.getQuizById);
router.patch('/:id', authenticate, quizController.updateQuiz);
router.patch('/:id/publish', authenticate, quizController.togglePublish);
router.delete('/:id', authenticate, quizController.deleteQuiz);

export const quizRoutes = router;
export default quizRoutes;
