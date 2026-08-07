export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não definido`);
  return value;
}
