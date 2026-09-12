import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 4000),
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:4000").replace(/\/$/, ""),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",

  databaseUrl: required("DATABASE_URL"),

  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",

  initialAdmin: {
    name: process.env.INITIAL_ADMIN_NAME ?? "Administrador",
    email: process.env.INITIAL_ADMIN_EMAIL ?? "admin@optiprocess.com.br",
    password: process.env.INITIAL_ADMIN_PASSWORD ?? "",
  },

  storage: {
    provider: (process.env.STORAGE_PROVIDER ?? "local") as "local" | "s3",
    s3Endpoint: process.env.S3_ENDPOINT ?? "",
    s3Region: process.env.S3_REGION ?? "auto",
    s3Bucket: process.env.S3_BUCKET ?? "",
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },

  whatsappNumber: process.env.WHATSAPP_NUMBER ?? "",

  // Sem chave configurada, o "esqueci a senha" fica desligado (ver lib/email.ts) - nao
  // quebra o resto do sistema, so essa funcionalidade especifica nao envia nada.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "RLP Maintenance <naoresponda@rlpmaintenance.com.br>",

  // Sem chave configurada, "Insights" fica desligado (ver lib/ai.ts) - mesmo padrao do
  // Resend acima: funcionalidade opcional, nao quebra o resto do sistema se faltar.
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
};
