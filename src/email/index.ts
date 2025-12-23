import { WorkerMailer } from "worker-mailer";

export async function idempotentSendEmail(
  env: CloudflareBindings,
  {
    idempotencyKey,
    to,
    subject,
    body,
  }: {
    idempotencyKey: string;
    to: string;
    subject: string;
    body: string;
  },
): Promise<boolean> {
  const existing = await env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.get(idempotencyKey);
  if (existing !== null) {
    return false;
  }

  await sendEmail(env, { to, subject, body });

  await env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.put(idempotencyKey, "1");

  return true;
}

export async function sendEmail(
  env: CloudflareBindings,
  {
    to,
    subject,
    body,
  }: {
    to: string;
    subject: string;
    body: string;
  },
) {
  if (env.ENVIRONMENT !== "production") {
    console.log(`[sendEmail] ${JSON.stringify({ to, subject, body }, null, 2)}`);
    return;
  }

  await WorkerMailer.send(
    {
      host: "smtp.mail.me.com",
      port: 587,
      secure: false,
      startTls: true,
      credentials: {
        username: env.ICLOUD_USER,
        password: env.ICLOUD_PASSWORD,
      },
      authType: "plain",
    },
    {
      from: { email: env.ICLOUD_USER },
      to: { email: to },
      subject,
      html: body,
    },
  );
}
