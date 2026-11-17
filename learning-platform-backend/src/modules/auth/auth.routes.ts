import { Router } from 'express';
import { apiKeyAuth } from '../../middlewares/apiKeyAuth';
import { jwtAuth } from '../../middlewares/jwtAuth';
import { authLimiter } from '../../middlewares/rateLimit';
import { validate } from '../../middlewares/validate';
import * as controller from './auth.controller';
import { loginSchema, playerLoginSchema, playerRegisterSchema, registerSchema } from './auth.schema';

const router = Router();

// --- Aplikasi client (API Key) ---
router.get('/', apiKeyAuth, controller.verifyApiKey);
router.post('/', apiKeyAuth, controller.verifyApiKey);
router.post('/player/register', apiKeyAuth, validate({ body: playerRegisterSchema }), controller.registerPlayer);
router.post('/player/login', apiKeyAuth, validate({ body: playerLoginSchema }), controller.loginPlayer);

// --- Developer Dashboard (JWT) ---
router.post('/developer/register', authLimiter, validate({ body: registerSchema }), controller.register);
router.post('/developer/login', authLimiter, validate({ body: loginSchema }), controller.login);
router.get('/developer/me', jwtAuth, controller.me);

export default router;
