import { asyncHandler } from '../../utils/asyncHandler';
import * as service from './auth.service';

export const register = asyncHandler(async (req, res) => {
  const data = await service.registerDeveloper(req.body);
  res.status(201).json({ success: true, data });
});

export const login = asyncHandler(async (req, res) => {
  const data = await service.loginDeveloper(req.body);
  res.json({ success: true, data });
});

export const me = asyncHandler(async (req, res) => {
  const data = await service.getDeveloperProfile(req.developer!.id);
  res.json({ success: true, data });
});

/** POST /api/auth - validasi API Key client (key sudah diverifikasi oleh apiKeyAuth). */
export const verifyApiKey = asyncHandler(async (req, res) => {
  const { id, name } = req.clientApp!;
  res.json({ success: true, data: { valid: true, app: { id, name } } });
});

export const registerPlayer = asyncHandler(async (req, res) => {
  const data = await service.registerPlayer(req.clientApp!.id, req.body);
  res.status(201).json({ success: true, data });
});

export const loginPlayer = asyncHandler(async (req, res) => {
  const data = await service.loginPlayer(req.clientApp!.id, req.body);
  res.json({ success: true, data });
});
