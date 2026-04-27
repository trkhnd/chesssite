import nodemailer from "nodemailer";
import { config, flags } from "../config.js";
import { logger } from "../logger.js";

const transporter = flags.emailEnabled
  ? nodemailer.createTransport(
      config.emailHost
        ? {
            host: config.emailHost,
            port: config.emailPort,
            secure: config.emailSecure,
            auth: {
              user: config.emailUser,
              pass: config.emailPass,
            },
          }
        : {
            service: "gmail",
            auth: {
              user: config.emailUser,
              pass: config.emailPass,
            },
          },
    )
  : null;

export async function sendEmail({ to, subject, html }) {
  if (!transporter || !to) {
    return { ok: false, skipped: true };
  }

  try {
    await transporter.sendMail({
      from: `Chess Master <${config.emailUser}>`,
      to,
      subject,
      html,
    });
    return { ok: true };
  } catch (error) {
    logger.error("Email delivery failed", { to, subject, error: error instanceof Error ? error.message : error });
    return { ok: false, error };
  }
}
