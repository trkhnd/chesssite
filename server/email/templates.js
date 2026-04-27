function shell(title, body) {
  return `
    <div style="font-family: Arial, sans-serif; background:#f6f2e8; color:#18201a; padding:32px;">
      <div style="max-width:640px; margin:0 auto; background:white; border-radius:18px; overflow:hidden; border:1px solid #e0d7c2;">
        <div style="padding:24px 28px; background:linear-gradient(135deg,#799b57,#d6a94a); color:white;">
          <div style="font-size:14px; letter-spacing:0.12em; text-transform:uppercase; opacity:0.9;">Chess Master</div>
          <h1 style="margin:8px 0 0; font-size:28px;">${title}</h1>
        </div>
        <div style="padding:28px;">
          ${body}
        </div>
      </div>
    </div>
  `;
}

export function welcomeEmail(user) {
  return shell(
    `Welcome, ${user.name}`,
    `
      <p style="line-height:1.7;">Your Chess Master account is ready. You can now save your games, receive room invites, and review your progress across devices.</p>
      <p style="line-height:1.7;">City focus: <strong>${user.city}</strong><br />Email: <strong>${user.email}</strong></p>
      <p style="line-height:1.7;">Train well and enjoy the next game.</p>
    `,
  );
}

export function authNoticeEmail(user) {
  return shell(
    "New sign-in detected",
    `
      <p style="line-height:1.7;">Hi ${user.name}, we noticed a new sign-in to your Chess Master account.</p>
      <p style="line-height:1.7;">If this was you, no action is needed. If not, reset your password and review your account settings.</p>
    `,
  );
}

export function invitationEmail({ inviterName, inviteLink, roomId }) {
  return shell(
    `${inviterName} invited you to play`,
    `
      <p style="line-height:1.7;">A friend invited you to a live chess room on Chess Master.</p>
      <p style="line-height:1.7;"><strong>Room:</strong> ${roomId}</p>
      <p style="line-height:1.7;">
        <a href="${inviteLink}" style="display:inline-block; padding:12px 18px; border-radius:12px; background:#799b57; color:white; text-decoration:none; font-weight:700;">
          Open live room
        </a>
      </p>
      <p style="line-height:1.7;">If the button does not work, open this link:<br /><a href="${inviteLink}">${inviteLink}</a></p>
    `,
  );
}

export function resultEmail({ userName, result, summary, roomId }) {
  return shell(
    "Game result ready",
    `
      <p style="line-height:1.7;">Hi ${userName}, your live game has finished.</p>
      <p style="line-height:1.7;"><strong>Room:</strong> ${roomId}<br /><strong>Result:</strong> ${result}</p>
      <p style="line-height:1.7;">${summary}</p>
    `,
  );
}

export function coachTipEmail({ userName, tip, evaluation }) {
  return shell(
    "Coach tip from your last game",
    `
      <p style="line-height:1.7;">Hi ${userName}, here is one practical idea from your recent analysis.</p>
      <p style="line-height:1.7;"><strong>Coach note:</strong> ${tip}</p>
      <p style="line-height:1.7;"><strong>Evaluation:</strong> ${evaluation}</p>
    `,
  );
}
