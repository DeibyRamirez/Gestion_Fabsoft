/**
 * Plantilla HTML de correo con la identidad visual del frontend (Atelier).
 *
 * Los clientes de correo no cargan Tailwind ni fuentes externas de forma fiable,
 * así que todo va con tablas, estilos inline y fallbacks del sistema.
 */

const COLORS = {
  bg: '#F3F5FB',
  surface: '#FFFFFF',
  fg: '#0B1023',
  muted: '#525C7A',
  soft: '#6B7593',
  border: '#E4E9F2',
  iris: '#5B3DF5',
  irisSoft: '#EEE8FF',
  irisText: '#5B21B6',
  cyan: '#7FE6FB',
  night: '#0B1023',
} as const;

const FONT_SANS = "'Plus Jakarta Sans','Segoe UI',Arial,sans-serif";
const FONT_SERIF = "Georgia,'Times New Roman',serif";

export interface EmailDetail {
  label: string;
  value: string;
  /** Muestra el valor como insignia (regla, estado, etc.). */
  badge?: boolean;
}

export interface EmailLayoutInput {
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  accent: string;
  bodyText: string;
  details: EmailDetail[];
  ctaLabel: string;
  ctaUrl: string;
  footerNote?: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });
}

/** Convierte texto plano en párrafos HTML, escapando y enlazando URLs. */
export function textToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const escaped = escapeHtml(paragraph).replace(/\n/g, '<br>');
      const linked = escaped.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener" style="color:#5B3DF5;text-decoration:underline;">$1</a>',
      );
      return `<p style="margin:0 0 16px;color:${COLORS.muted};font-family:${FONT_SANS};font-size:15px;line-height:1.7;">${linked}</p>`;
    })
    .join('');
}

function renderBadge(value: string): string {
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background-color:${COLORS.irisSoft};color:${COLORS.irisText};font-family:${FONT_SANS};font-size:11px;font-weight:700;letter-spacing:.2px;white-space:nowrap;">${escapeHtml(value)}</span>`;
}

function renderDetails(details: EmailDetail[]): string {
  if (details.length === 0) return '';

  const rows = details
    .map(
      (detail, index) => `
        <tr>
          <td style="padding:11px 0;${index > 0 ? `border-top:1px solid ${COLORS.border};` : ''}color:${COLORS.soft};font-family:${FONT_SANS};font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;vertical-align:top;">${escapeHtml(detail.label)}</td>
          <td align="right" style="padding:11px 0 11px 16px;${index > 0 ? `border-top:1px solid ${COLORS.border};` : ''}color:${COLORS.fg};font-family:${FONT_SANS};font-size:14px;font-weight:600;line-height:1.45;text-align:right;word-break:break-word;vertical-align:top;">${detail.badge ? renderBadge(detail.value) : escapeHtml(detail.value)}</td>
        </tr>`,
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;background-color:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:14px;">
      <tr>
        <td style="padding:6px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${rows}
          </table>
        </td>
      </tr>
    </table>`;
}

function renderCta(label: string, url: string): string {
  const safeUrl = escapeHtml(url);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;">
      <tr>
        <td align="center" bgcolor="${COLORS.iris}" style="border-radius:12px;background-color:${COLORS.iris};">
          <a href="${safeUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 24px;border-radius:12px;color:#FFFFFF;font-family:${FONT_SANS};font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>
    <p style="margin:12px 0 0;color:${COLORS.soft};font-family:${FONT_SANS};font-size:11px;line-height:1.6;">Si el botón no funciona, copia este enlace:<br><a href="${safeUrl}" target="_blank" rel="noopener" style="color:${COLORS.iris};text-decoration:underline;word-break:break-all;">${safeUrl}</a></p>`;
}

export function renderEmailHtml(input: EmailLayoutInput): string {
  const subject = escapeHtml(input.subject);
  const preheader = escapeHtml(input.preheader);
  const body = textToHtml(input.bodyText);
  const details = renderDetails(input.details);
  const cta = renderCta(input.ctaLabel, input.ctaUrl);
  const footerNote = input.footerNote
    ? `<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid ${COLORS.border};color:${COLORS.soft};font-family:${FONT_SANS};font-size:12px;line-height:1.6;">${escapeHtml(input.footerNote)}</p>`
    : '';

  return `<!doctype html>
<html lang="es" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${subject}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .email-shell { padding: 16px 8px !important; }
      .email-header { padding: 24px 20px !important; border-radius: 16px 16px 0 0 !important; }
      .email-body { padding: 24px 20px !important; border-radius: 0 0 16px 16px !important; }
      .email-title { font-size: 25px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:${COLORS.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};">
    <tr>
      <td class="email-shell" align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;">
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:18px;box-shadow:0 18px 40px -24px rgba(26,21,80,0.28);">
                <tr>
                  <td class="email-header" style="padding:28px 32px;border-radius:18px 18px 0 0;background-color:${COLORS.night};background-image:linear-gradient(135deg,${COLORS.night} 0%,#1A1550 60%,#2A1B7A 100%);">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;border-radius:12px;background-color:${COLORS.iris};color:#FFFFFF;font-family:${FONT_SANS};font-size:19px;font-weight:800;line-height:42px;text-align:center;">F</td>
                        <td style="padding-left:12px;color:#FFFFFF;font-family:${FONT_SANS};font-size:17px;font-weight:800;letter-spacing:-.3px;">FabSoft</td>
                      </tr>
                    </table>
                    <p style="margin:24px 0 0;color:${COLORS.cyan};font-family:${FONT_SANS};font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</p>
                    <h1 class="email-title" style="margin:8px 0 0;color:#FFFFFF;font-family:${FONT_SANS};font-size:30px;font-weight:800;line-height:1.15;letter-spacing:-.6px;">${escapeHtml(input.title)} <em style="font-family:${FONT_SERIF};font-weight:400;color:${COLORS.cyan};font-style:italic;">${escapeHtml(input.accent)}</em></h1>
                  </td>
                </tr>
                <tr>
                  <td class="email-body" style="padding:32px;border-right:1px solid ${COLORS.border};border-bottom:1px solid ${COLORS.border};border-left:1px solid ${COLORS.border};border-radius:0 0 18px 18px;background-color:${COLORS.surface};">
                    ${body}
                    ${details}
                    ${cta}
                    ${footerNote}
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0;color:${COLORS.soft};font-family:${FONT_SANS};font-size:11px;line-height:1.6;text-align:center;">
                FabSoft · Gestión de clientes, suscripciones y renovaciones<br>
                Correo automático. No respondas a este mensaje.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
