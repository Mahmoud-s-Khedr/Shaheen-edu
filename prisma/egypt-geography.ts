// Data source: Tech-Labs/egypt-governorates-and-cities-db
// Pinned source commit: b1afbfb5565d2e419dd8b48f1fb05e41aa1a7788 (MIT).
// The exact source CSV files are vendored in ./data; see THIRD_PARTY_NOTICES.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface EgyptCitySeed {
  nameAr: string;
  nameEn: string;
}

export interface EgyptGovernorateSeed {
  nameAr: string;
  nameEn: string;
  cities: readonly EgyptCitySeed[];
}

interface CsvGovernorate {
  id: string;
  nameAr: string;
  nameEn: string;
}

interface CsvCity extends EgyptCitySeed {
  governorateId: string;
}

function parseCsv(fileName: string, expectedHeaders: readonly string[]) {
  const source = readFileSync(join(__dirname, 'data', fileName), 'utf8');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field) throw new Error(`Invalid CSV quoting in ${fileName}.`);
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }

  if (quoted) throw new Error(`Unterminated CSV value in ${fileName}.`);
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  if (
    !headers ||
    headers.length !== expectedHeaders.length ||
    headers.some((header, index) => header !== expectedHeaders[index])
  ) {
    throw new Error(`Unexpected CSV headers in ${fileName}.`);
  }
  return records;
}

const governorates: CsvGovernorate[] = parseCsv('egypt-governorates.csv', [
  'id',
  'province_id',
  'governorate_name_ar',
  'governorate_name_en',
]).map(([id, , nameAr, nameEn]) => ({ id, nameAr, nameEn }));

const cities: CsvCity[] = parseCsv('egypt-cities.csv', [
  'id',
  'governorate_id',
  'city_name_ar',
  'city_name_en',
]).map(([, governorateId, nameAr, nameEn]) => ({
  governorateId,
  nameAr,
  nameEn,
}));

if (governorates.length !== 27 || cities.length !== 396) {
  throw new Error('Egypt geography source data is incomplete.');
}

const citiesByGovernorateId = new Map<string, EgyptCitySeed[]>();
for (const city of cities) {
  const entries = citiesByGovernorateId.get(city.governorateId) ?? [];
  entries.push({ nameAr: city.nameAr, nameEn: city.nameEn });
  citiesByGovernorateId.set(city.governorateId, entries);
}

export const EGYPT_GOVERNORATES: readonly EgyptGovernorateSeed[] =
  governorates.map(({ id, nameAr, nameEn }) => ({
    nameAr,
    nameEn,
    cities: citiesByGovernorateId.get(id) ?? [],
  }));
