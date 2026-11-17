import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(72),
});

export const playerRegisterSchema = z.object({
  name: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter').max(80),
  email: z.string().trim().toLowerCase().email('Masukkan alamat email yang valid'),
  password: z.string().min(4, 'Kata sandi minimal 4 karakter').max(72),
});

export const playerLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Masukkan alamat email yang valid'),
  password: z.string().min(1, 'Masukkan kata sandi').max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PlayerRegisterInput = z.infer<typeof playerRegisterSchema>;
export type PlayerLoginInput = z.infer<typeof playerLoginSchema>;
