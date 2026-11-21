import { z } from 'zod';

const optionalEmail = z
  .string()
  .trim()
  .max(254, 'Máximo 254 caracteres')
  .refine(
    (value) => value.length === 0 || z.string().email().safeParse(value).success,
    'Correo inválido',
  )
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

/** Canal de contacto que el portal muestra a los usuarios de cliente. */
export const ContactChannelSchema = z
  .object({
    email: optionalEmail,
    phone: optionalText(30),
    hours: optionalText(200),
  })
  .strict();
export type ContactChannel = z.infer<typeof ContactChannelSchema>;

/** Configuración general editable por el administrador. */
export const SettingsSchema = z
  .object({
    contactChannel: ContactChannelSchema,
  })
  .strict();
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_CONTACT_CHANNEL: ContactChannel = {
  email: null,
  phone: null,
  hours: null,
};

export const DEFAULT_SETTINGS: Settings = {
  contactChannel: DEFAULT_CONTACT_CHANNEL,
};
