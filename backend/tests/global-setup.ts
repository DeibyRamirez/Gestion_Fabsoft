export default async function globalSetup() {
  if (new Date().getTimezoneOffset() !== 0) {
    throw new Error('TZ debe ser UTC (getTimezoneOffset() === 0)');
  }
  if (process.env.TZ !== 'UTC') {
    throw new Error('process.env.TZ debe ser UTC');
  }
}
