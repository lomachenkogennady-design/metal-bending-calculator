/** Реквизиты ООО «ФАЙЕРПРОМ» — из счёта №150 от 09.09.2026 */
export const REQUISITES = {
  company: {
    fullName: 'ООО «ФАЙЕРПРОМ»',
    shortName: 'ООО «ФАЙЕРПРОМ»',
    legalAddress: '197342, Город Санкт-Петербург, вн.тер. г. Муниципальный Округ Ланское, наб. Чёрной Речки, дом 47, строение 1, помещение 4-Н, часть 349.1',
    inn: '7814643719',
    kpp: '781401001',
    ogrn: '1167847130791',
  },
  bank: {
    name: 'СЕВЕРО-ЗАПАДНЫЙ БАНК ПАО СБЕРБАНК Г. САНКТ-ПЕТЕРБУРГ',
    bik: '044030653',
    account: '40702810755070004215',
    corrAccount: '30101810500000000653',
  },
  sign: {
    director: 'Первухин Д. А.',
    accountant: 'Первухин Д. А.',
  },
  contact: {
    phone: '+7 (921) 863-56-50',
    email: 'san@fire-prom.ru',
    site: 'www.fire-prom.ru',
  },
  vat: 0.22,
} as const;

/** Сумма прописью (для счёта) — рубли и копейки */
export function sumInWords(amount: number): string {
  const rub = Math.floor(amount);
  const kop = Math.round((amount - rub) * 100);

  const units = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять',
                 'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
                 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят',
                'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот',
                    'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

  // Триада (0..999) — мужской или женский род
  const tri = (n: number, fem = false): string => {
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    const parts: string[] = [];
    if (hundreds[h]) parts.push(hundreds[h]);
    if (t === 1) {
      const idx = 10 + u;
      parts.push(fem ? (idx === 11 ? 'одиннадцать' : idx === 12 ? 'двенадцать' : units[idx]) : units[idx]);
    } else {
      if (tens[t]) parts.push(tens[t]);
      if (u) parts.push(fem && u === 1 ? 'одна' : fem && u === 2 ? 'две' : units[u]);
    }
    return parts.join(' ');
  };

  // Склонение разряда: 1 миллион, 2 миллиона, 5 миллионов
  const plural = (n: number, one: string, few: string, many: string): string => {
    const lastTwo = n % 100;
    const last = n % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  };

  const billions = Math.floor(rub / 1_000_000_000);
  const millions = Math.floor((rub % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((rub % 1_000_000) / 1000);
  const rest = rub % 1000;

  const parts: string[] = [];

  if (billions) {
    parts.push(tri(billions));
    parts.push(plural(billions, 'миллиард', 'миллиарда', 'миллиардов'));
  }
  if (millions) {
    parts.push(tri(millions));
    parts.push(plural(millions, 'миллион', 'миллиона', 'миллионов'));
  }
  if (thousands) {
    parts.push(tri(thousands, true));
    parts.push(plural(thousands, 'тысяча', 'тысячи', 'тысяч'));
  }
  if (rest || parts.length === 0) {
    parts.push(tri(rest));
  }

  let out = parts.join(' ').trim();
  if (!out) out = 'ноль';
  out = out.charAt(0).toUpperCase() + out.slice(1);

  const rubWord = plural(rub, 'рубль', 'рубля', 'рублей');
  const kopWord = plural(kop, 'копейка', 'копейки', 'копеек');
  const kopStr = String(kop).padStart(2, '0');

  return `${out} ${rubWord} ${kopStr} ${kopWord}`;
}
