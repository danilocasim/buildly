// Email delivery behind one interface: Resend in staging and production, the console in
// development (EMAIL_PROVIDER_API_KEY=console) and in tests (a recorder).
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export function consoleEmailSender(write: (line: string) => void = console.log): EmailSender {
  return {
    send(message) {
      write(`[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
      return Promise.resolve();
    },
  };
}

export function resendEmailSender(
  apiKey: string,
  from: string,
  fetchImpl: typeof fetch = fetch,
): EmailSender {
  return {
    async send(message) {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });
      if (!response.ok) throw new Error(`Resend responded ${response.status}`);
    },
  };
}

export function emailSenderFor(config: {
  EMAIL_PROVIDER_API_KEY: string;
  EMAIL_FROM: string;
}): EmailSender {
  return config.EMAIL_PROVIDER_API_KEY === "console"
    ? consoleEmailSender()
    : resendEmailSender(config.EMAIL_PROVIDER_API_KEY, config.EMAIL_FROM);
}
