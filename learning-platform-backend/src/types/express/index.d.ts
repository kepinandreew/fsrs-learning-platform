declare global {
  namespace Express {
    interface Request {
      /** Diisi oleh jwtAuth (Developer Dashboard). */
      developer?: { id: string; email: string };
      /** Diisi oleh apiKeyAuth (aplikasi client). Catatan: `req.app` sudah dipakai Express. */
      clientApp?: {
        id: string;
        developerId: string;
        name: string;
        requestRetention: number;
      };
    }
  }
}

export {};
