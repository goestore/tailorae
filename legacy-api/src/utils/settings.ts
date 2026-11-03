import { prisma } from '@/lib/prisma';

/**
 * Platform switches the owner controls from the admin console, stored in
 * SystemSetting. Every key has a default here so a fresh database behaves
 * sensibly before anyone has saved a value.
 */
export const SETTING_DEFAULTS = {
  /** When false, /sell and POST /seller/apply refuse new applications. */
  'seller.applicationsOpen': true,
  /** Commission % when neither the seller nor the category sets one. */
  'commission.defaultRate': 10,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K] extends boolean ? boolean : number;

function parse<K extends SettingKey>(key: K, raw: string): SettingValue<K> {
  const fallback = SETTING_DEFAULTS[key];
  if (typeof fallback === 'boolean') return (raw === 'true') as SettingValue<K>;
  const n = Number(raw);
  return (Number.isFinite(n) ? n : fallback) as SettingValue<K>;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row ? parse(key, row.value) : (SETTING_DEFAULTS[key] as SettingValue<K>);
}

export async function getSettings(): Promise<{ [K in SettingKey]: SettingValue<K> }> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: Object.keys(SETTING_DEFAULTS) } } });
  const out = { ...SETTING_DEFAULTS } as Record<string, unknown>;
  for (const row of rows) out[row.key] = parse(row.key as SettingKey, row.value);
  return out as { [K in SettingKey]: SettingValue<K> };
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingValue<K>): Promise<void> {
  const type = typeof SETTING_DEFAULTS[key] === 'boolean' ? 'BOOLEAN' : 'NUMBER';
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: String(value), type },
    create: { key, value: String(value), type },
  });
}
