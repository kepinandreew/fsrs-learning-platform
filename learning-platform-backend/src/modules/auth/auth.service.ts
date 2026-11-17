import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import type { LoginInput, PlayerLoginInput, PlayerRegisterInput, RegisterInput } from './auth.schema';

function signToken(dev: { id: string; email: string }): string {
  return jwt.sign({ email: dev.email }, env.JWT_SECRET, {
    subject: dev.id,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

const publicDev = { id: true, email: true, name: true, createdAt: true } as const;

export async function registerDeveloper(input: RegisterInput) {
  const exists = await prisma.developer.findUnique({ where: { email: input.email } });
  if (exists) throw ApiError.conflict('Email sudah terdaftar');

  const developer = await prisma.developer.create({
    data: { name: input.name, email: input.email, passwordHash: await bcrypt.hash(input.password, 12) },
    select: publicDev,
  });
  return { developer, token: signToken(developer) };
}

export async function loginDeveloper(input: LoginInput) {
  const dev = await prisma.developer.findUnique({ where: { email: input.email } });
  // Pesan sama untuk email salah / password salah agar tidak membocorkan keberadaan akun.
  const ok = dev ? await bcrypt.compare(input.password, dev.passwordHash) : false;
  if (!dev || !ok || !dev.isActive) throw ApiError.unauthorized('Email atau password salah');

  return {
    developer: { id: dev.id, email: dev.email, name: dev.name, createdAt: dev.createdAt },
    token: signToken(dev),
  };
}

export async function getDeveloperProfile(id: string) {
  const dev = await prisma.developer.findUnique({ where: { id }, select: publicDev });
  if (!dev) throw ApiError.notFound('Developer tidak ditemukan');
  return dev;
}

export async function registerPlayer(appId: string, input: PlayerRegisterInput) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  const existingByEmail = await prisma.user.findFirst({
    where: { appId, OR: [{ email }, { externalId: email }] },
  });
  if (existingByEmail && existingByEmail.passwordHash) {
    throw ApiError.conflict('Email ini sudah terdaftar. Silakan masuk dengan kata sandimu!');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  if (existingByEmail) {
    const updated = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: { displayName: name, email, passwordHash },
    });
    return {
      id: updated.id,
      externalUserId: updated.externalId,
      displayName: updated.displayName || name,
      email: updated.email || email,
    };
  }

  // Jika siswa sudah punya profil lama dengan nama sama (tanpa email), tautkan agar progresnya utuh.
  const legacyByName = await prisma.user.findFirst({
    where: {
      appId,
      email: null,
      displayName: { equals: name, mode: 'insensitive' },
    },
  });

  if (legacyByName) {
    const linked = await prisma.user.update({
      where: { id: legacyByName.id },
      data: { displayName: name, email, passwordHash },
    });
    return {
      id: linked.id,
      externalUserId: linked.externalId,
      displayName: linked.displayName || name,
      email: linked.email || email,
    };
  }

  const created = await prisma.user.create({
    data: {
      appId,
      externalId: email,
      email,
      displayName: name,
      passwordHash,
    },
  });

  return {
    id: created.id,
    externalUserId: created.externalId,
    displayName: created.displayName || name,
    email: created.email || email,
  };
}

export async function loginPlayer(appId: string, input: PlayerLoginInput) {
  const email = input.email.trim().toLowerCase();

  let user = await prisma.user.findFirst({
    where: { appId, OR: [{ email }, { externalId: email }] },
  });

  if (!user) {
    // Jika siswa sudah pernah mendaftar di aplikasi/game lain pada platform ini, izinkan login lintas-game.
    const crossAppUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { externalId: email }], passwordHash: { not: null } },
    });
    if (!crossAppUser || !crossAppUser.passwordHash) {
      throw ApiError.unauthorized('Email belum terdaftar. Silakan Daftar Baru terlebih dahulu!');
    }
    const okCross = await bcrypt.compare(input.password, crossAppUser.passwordHash);
    if (!okCross) throw ApiError.unauthorized('Email atau kata sandi salah');

    user = await prisma.user.upsert({
      where: { appId_externalId: { appId, externalId: email } },
      create: {
        appId,
        externalId: email,
        email,
        displayName: crossAppUser.displayName || email,
        passwordHash: crossAppUser.passwordHash,
      },
      update: {
        email,
        displayName: crossAppUser.displayName || undefined,
        passwordHash: crossAppUser.passwordHash,
      },
    });
  } else if (user.passwordHash) {
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw ApiError.unauthorized('Email atau kata sandi salah');
  } else {
    // Akun lama yang belum memiliki passwordHash: simpan kata sandi pada login pertama.
    const passwordHash = await bcrypt.hash(input.password, 10);
    user = await prisma.user.update({
      where: { id: user.id },
      data: { email: user.email || email, passwordHash },
    });
  }

  return {
    id: user.id,
    externalUserId: user.externalId,
    displayName: user.displayName || user.externalId,
    email: user.email || email,
  };
}
