type Company = { id: string; name: string };

const KALIKA_COMPANY_NAMES = new Set([
  'kalikasteel',
  'kalikasteelalloys',
  'kalikasteelalloyspvtltd',
  'kalikasteelalloysprivatelimited',
]);

/** The Add Case default is Kalika, independent of browser history or Tally. */
export function defaultCaseCompany(companies: Company[], now = new Date()): string {
  const kalika = companies.flatMap(company => {
    const year = company.name.match(/^(.*?)\s*(?:[-–—·|]\s*)?\(?\s*(?:FY\s*)?((?:20)?\d{2})\s*[-–—]\s*(?:20)?(\d{2})\)?\s*$/i);
    const name = (year?.[1] || company.name).toLowerCase().replace(/[^a-z0-9]/g, '');
    return KALIKA_COMPANY_NAMES.has(name) ? [{ ...company, year }] : [];
  });
  if (kalika.length === 1) return kalika[0].id;
  const india = new Date(now.getTime() + 330 * 60_000);
  const currentYear = india.getUTCFullYear() - (india.getUTCMonth() < 3 ? 1 : 0);
  const current = kalika.filter(company => company.year &&
    (company.year[2].length === 2 ? 2000 : 0) + Number(company.year[2]) === currentYear &&
    Number(company.year[3]) === (currentYear + 1) % 100);
  return current.length === 1 ? current[0].id : '';
}
