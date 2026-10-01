export async function idempotentSendEmail(
  env: Env,
  {
    body,
    expirationTtl,
    idempotencyKey,
    subject,
    to,
  }: {
    body: string;
    // Seconds until the key expires. Omit to keep the key forever.
    expirationTtl?: number;
    idempotencyKey: string;
    subject: string;
    to: string;
  },
): Promise<boolean> {
  const existing = await env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.get(idempotencyKey);
  if (existing !== null) {
    console.log(`Skipping email due to idempotency key hit: ${idempotencyKey}`);
    return false;
  }

  await sendEmail(env, { body, subject, to });

  await env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.put(
    idempotencyKey,
    "1",
    expirationTtl === undefined ? undefined : { expirationTtl },
  );

  return true;
}

export async function sendEmail(
  env: Env,
  {
    body,
    subject,
    to,
  }: {
    body: string;
    subject: string;
    to: string;
  },
) {
  if (env.ENVIRONMENT !== "production") {
    console.log(`[sendEmail] ${JSON.stringify({ body, subject, to }, null, 2)}`);
    return;
  }

  await env.EMAIL.send({
    from: "run@gmcabrita.com",
    html: body,
    subject,
    to,
  });
}
