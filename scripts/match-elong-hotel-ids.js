#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_INPUT = '/Users/admin/Documents/Farland网站/tmp/combined-hotel-elong-id-worklist.json';
const DEFAULT_OUTPUT_DIR = '/Users/admin/Documents/Farland网站/tmp';
const SITE_HOTELS = '/Users/admin/Documents/Farland网站/assets/data/hotels.json';
const SCHOOL_GUIDES = path.join(__dirname, '..', 'cloudfunctions', 'searchElongHotels', 'schoolHotelGuides.json');
const CITY_CACHE = '/Users/admin/Documents/Farland网站/tmp/elong-us-city-cache-pages-350-450.json';
const STATIC_CACHE_DIR = '/Users/admin/Documents/Farland网站/tmp/elong-static-hotels-cache';

const STATE_NAMES = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california',
  CO: 'colorado', CT: 'connecticut', DE: 'delaware', DC: 'district of columbia',
  FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho', IL: 'illinois',
  IN: 'indiana', IA: 'iowa', KS: 'kansas', KY: 'kentucky', LA: 'louisiana',
  ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan',
  MN: 'minnesota', MS: 'mississippi', MO: 'missouri', MT: 'montana',
  NE: 'nebraska', NV: 'nevada', NH: 'new hampshire', NJ: 'new jersey',
  NM: 'new mexico', NY: 'new york', NC: 'north carolina', ND: 'north dakota',
  OH: 'ohio', OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania',
  RI: 'rhode island', SC: 'south carolina', SD: 'south dakota',
  TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont', VA: 'virginia',
  WA: 'washington', WV: 'west virginia', WI: 'wisconsin', WY: 'wyoming',
};

const SEED_CITIES = [
  { CityId: '110083599', CityNameEn: 'Boston', ProvinceNameEn: 'Massachusetts', CountryCode: 'US' },
  { CityId: '110080776', CityNameEn: 'New York', ProvinceNameEn: 'New York', CountryCode: 'US' },
  { CityId: '110087624', CityNameEn: 'Hartford', ProvinceNameEn: 'Connecticut', CountryCode: 'US' },
  { CityId: '110087653', CityNameEn: 'South Windsor', ProvinceNameEn: 'Connecticut', CountryCode: 'US' },
  { CityId: '110087668', CityNameEn: 'Bloomfield', ProvinceNameEn: 'Connecticut', CountryCode: 'US' },
  { CityId: '110087678', CityNameEn: 'Avon', ProvinceNameEn: 'Connecticut', CountryCode: 'US' },
  { CityId: '110087681', CityNameEn: 'East Windsor', ProvinceNameEn: 'Connecticut', CountryCode: 'US' },
  { CityId: '110087683', CityNameEn: 'West Hartford', ProvinceNameEn: 'Connecticut', CountryCode: 'US' },
  { CityId: '110087686', CityNameEn: 'Simsbury', ProvinceNameEn: 'Connecticut', CountryCode: 'US' },
  { CityId: '110087688', CityNameEn: 'Windsor', ProvinceNameEn: 'Connecticut', CountryCode: 'US' },
  { CityId: '110087689', CityNameEn: 'Windsor Locks', ProvinceNameEn: 'Connecticut', CountryCode: 'US' },
  { CityId: '110087690', CityNameEn: 'Farmington', ProvinceNameEn: 'Connecticut', CountryCode: 'US' },
];

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
    port: '9421',
    limit: 0,
    start: 0,
    refreshStatic: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) args.input = argv[++i];
    else if (arg === '--out' && argv[i + 1]) args.outputDir = argv[++i];
    else if (arg === '--port' && argv[i + 1]) args.port = argv[++i];
    else if (arg === '--limit' && argv[i + 1]) args.limit = Number(argv[++i]) || 0;
    else if (arg === '--start' && argv[i + 1]) args.start = Number(argv[++i]) || 0;
    else if (arg === '--refresh-static') args.refreshStatic = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function usage() {
  return [
    'Usage: node scripts/match-elong-hotel-ids.js [--limit 20] [--start 0] [--port 9421]',
    '',
    'Reads the Farland hotel worklist and matches hotel names to eLong HotelId via CloudBase.',
    'Outputs enriched CSV/JSON files under /Users/admin/Documents/Farland网站/tmp.',
  ].join('\n');
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function csvEscape(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file, rows, columns) {
  const lines = [columns.join(',')].concat(rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')));
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bmt\b/g, 'mount')
    .replace(/[^a-z0-9]+/g, '');
}

function tokenList(value) {
  const stop = new Set([
    'the', 'and', 'hotel', 'inn', 'suites', 'suite', 'by', 'at', 'of', 'a',
    'an', 'airport', 'downtown', 'center', 'centre', 'area',
  ]);
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bmt\b/g, 'mount')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !stop.has(token));
}

function stateKeys(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  const upper = text.toUpperCase();
  const keys = [normalizeKey(text)];
  if (STATE_NAMES[upper]) keys.push(normalizeKey(STATE_NAMES[upper]));
  Object.entries(STATE_NAMES).forEach(([abbr, name]) => {
    if (normalizeKey(name) === normalizeKey(text)) keys.push(normalizeKey(abbr));
  });
  return Array.from(new Set(keys.filter(Boolean)));
}

function stateLabel(value) {
  const keys = stateKeys(value);
  if (!keys.length) return '';
  const abbr = Object.keys(STATE_NAMES).find((key) => keys.includes(normalizeKey(key)) || keys.includes(normalizeKey(STATE_NAMES[key])));
  return abbr || value;
}

function cityStateKey(city, state) {
  return `${normalizeKey(city)}|${stateLabel(state)}`;
}

function makeCityIndex() {
  const cache = readJson(CITY_CACHE, {});
  const rawRows = []
    .concat(SEED_CITIES)
    .concat(Array.isArray(cache.rows) ? cache.rows : []);
  const byCityState = new Map();
  const byCity = new Map();
  rawRows.forEach((raw) => {
    if (!raw || raw.CountryCode !== 'US' || !raw.CityId) return;
    const city = raw.CityNameEn || raw.CityName;
    const state = raw.ProvinceNameEn || raw.ProvinceName || raw.StateName || raw.State;
    if (!city) return;
    const row = {
      city,
      state,
      state_label: stateLabel(state),
      city_id: String(raw.CityId),
      raw,
    };
    const key = cityStateKey(city, state);
    if (!byCityState.has(key)) byCityState.set(key, row);
    const cityKey = normalizeKey(city);
    if (!byCity.has(cityKey)) byCity.set(cityKey, []);
    byCity.get(cityKey).push(row);
  });
  return { byCityState, byCity, rows: Array.from(byCityState.values()) };
}

function resolveCity(cityIndex, city, state) {
  if (!city) return null;
  const exact = cityIndex.byCityState.get(cityStateKey(city, state));
  if (exact) return exact;
  const cityMatches = cityIndex.byCity.get(normalizeKey(city)) || [];
  if (!cityMatches.length) return null;
  const requestedState = stateLabel(state);
  if (requestedState) {
    const inState = cityMatches.find((item) => item.state_label === requestedState);
    if (inState) return inState;
  }
  return cityMatches.length === 1 ? cityMatches[0] : null;
}

function addHint(map, hotelName, city, state, source, confidence, extra = {}) {
  const hotelKey = normalizeKey(hotelName);
  if (!hotelKey || !city) return;
  const hint = {
    city: String(city).trim(),
    state: stateLabel(state),
    source,
    confidence,
    ...extra,
  };
  if (!hint.city) return;
  if (!map.has(hotelKey)) map.set(hotelKey, []);
  const exists = map.get(hotelKey).some((item) => cityStateKey(item.city, item.state) === cityStateKey(hint.city, hint.state));
  if (!exists) map.get(hotelKey).push(hint);
}

function makeHintMap(worklist, cityIndex) {
  const wanted = new Set(worklist.map((row) => normalizeKey(row.hotel)));
  const hints = new Map();

  readJson(SITE_HOTELS, []).forEach((hotel) => {
    if (!wanted.has(normalizeKey(hotel.hotelName))) return;
    addHint(hints, hotel.hotelName, hotel.city, hotel.state, 'site_hotels_json', 100);
  });

  readJson(SCHOOL_GUIDES, []).forEach((school) => {
    (school.lodging || []).forEach((hotel) => {
      if (!wanted.has(normalizeKey(hotel.name))) return;
      addHint(
        hints,
        hotel.name,
        hotel.hotelCity || school.city,
        hotel.hotelState || school.state,
        hotel.hotelCity ? 'school_guides_hotel_city' : 'school_guides_school_city',
        hotel.hotelCity ? 95 : 70,
      );
    });
  });

  const cityRowsBySpecificity = cityIndex.rows
    .filter((city) => {
      const cityNorm = normalizeKey(city.city);
      return cityNorm && cityNorm.length >= 5;
    })
    .sort((a, b) => normalizeKey(b.city).length - normalizeKey(a.city).length);

  worklist.forEach((row) => {
    const hotel = row.hotel || '';
    const hotelNorm = normalizeKey(hotel);
    const existing = hints.get(hotelNorm) || [];
    const existingStates = Array.from(new Set(existing.map((item) => item.state).filter(Boolean)));
    cityRowsBySpecificity
      .filter((city) => {
        const cityNorm = normalizeKey(city.city);
        if (!hotelNorm.includes(cityNorm)) return false;
        if (existingStates.length && !existingStates.includes(city.state_label)) return false;
        return true;
      })
      .slice(0, 6)
      .forEach((city) => {
        const cityNorm = normalizeKey(city.city);
        const confidence = existingStates.length ? 82 : Math.min(78, 60 + Math.floor(cityNorm.length / 2));
        const ambiguousCity = !existingStates.length && (cityIndex.byCity.get(cityNorm) || []).length > 1;
        addHint(hints, hotel, city.city, city.state_label, 'hotel_name_city_token', confidence, { ambiguous_city_token: ambiguousCity });
      });
  });

  return hints;
}

function loadAutomator() {
  try {
    return require('miniprogram-automator');
  } catch (error) {
    return require('/tmp/farland-miniprogram-automator/node_modules/miniprogram-automator');
  }
}

async function callCloud(mini, name, data) {
  const response = await mini.evaluate((payload) => new Promise((resolve) => {
    wx.cloud.callFunction({
      name: payload.name,
      data: payload.data,
      success: (result) => resolve({ ok: true, result: result.result }),
      fail: (error) => resolve({ ok: false, error }),
    });
  }), { name, data });
  if (!response || !response.ok) {
    throw new Error(`Cloud function ${name} failed: ${JSON.stringify(response && response.error)}`);
  }
  return response.result;
}

function staticCacheFile(cityId) {
  return path.join(STATIC_CACHE_DIR, `${cityId}.json`);
}

async function loadStaticHotels(mini, city, refreshStatic) {
  fs.mkdirSync(STATIC_CACHE_DIR, { recursive: true });
  const file = staticCacheFile(city.city_id);
  if (!refreshStatic && fs.existsSync(file)) {
    const cached = readJson(file, null);
    if (cached && Array.isArray(cached.hotels)) return cached;
  }

  const response = await callCloud(mini, 'elongHotelGateway', {
    action: 'staticList',
    CityId: city.city_id,
    PageSize: 2000,
    PageIndex: 1,
  });
  if (!response || !response.success) {
    const message = response && (response.error_message || response.message || response.elong_code || response.error_code);
    throw new Error(`staticList failed for ${city.city}, ${city.state_label}: ${message || 'unknown error'}`);
  }
  const result = response.result || {};
  const hotels = (Array.isArray(result.Hotels) ? result.Hotels : (Array.isArray(result.HotelIds) ? result.HotelIds : []))
    .filter((hotel) => hotel && hotel.HotelId)
    .filter((hotel) => hotel.HotelStatus === undefined || String(hotel.HotelStatus) === '0');
  const payload = {
    generated_at: new Date().toISOString(),
    city,
    count: Number(result.Count || hotels.length || 0),
    hotels,
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

function hotelNameText(hotel) {
  return [hotel.HotelNameEn, hotel.HotelName].filter(Boolean).join(' ');
}

function scoreCandidate(targetName, candidate) {
  const target = normalizeKey(targetName);
  const candidateText = normalizeKey(hotelNameText(candidate));
  if (!target || !candidateText) return 0;
  if (target === candidateText) return 1000;
  if (candidateText.includes(target) || target.includes(candidateText)) {
    return 900 - Math.min(120, Math.abs(candidateText.length - target.length));
  }
  const tokens = tokenList(targetName);
  if (!tokens.length) return 0;
  const candidateJoined = normalizeKey(hotelNameText(candidate));
  const matched = tokens.filter((token) => candidateJoined.includes(normalizeKey(token)));
  const required = Math.min(tokens.length, Math.max(2, Math.ceil(tokens.length * 0.65)));
  if (matched.length < required) return 0;
  let score = 560 + matched.length * 42;
  const first = tokens[0] && candidateJoined.includes(normalizeKey(tokens[0]));
  const second = tokens[1] && candidateJoined.includes(normalizeKey(tokens[1]));
  if (first) score += 120;
  if (first && second) score += 60;
  if (matched.length === tokens.length) score += 80;
  return Math.min(score, 880);
}

function bestMatch(targetName, hotels) {
  const ranked = hotels
    .map((hotel) => ({ hotel, score: scoreCandidate(targetName, hotel) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return {
    best: ranked[0] || null,
    second: ranked[1] || null,
    candidates: ranked.slice(0, 5),
  };
}

function classifyMatch(best, second) {
  if (!best) return 'no_match';
  if (best.score >= 900) return second && second.score >= best.score - 30 ? 'needs_review' : 'matched';
  if (best.score >= 820) return second && second.score >= best.score - 50 ? 'needs_review' : 'matched';
  if (best.score >= 680) return 'needs_review';
  return 'no_match';
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const worklist = readJson(args.input, []);
  if (!Array.isArray(worklist) || !worklist.length) {
    throw new Error(`No worklist rows found: ${args.input}`);
  }
  const selected = worklist.slice(args.start, args.limit ? args.start + args.limit : undefined);
  const cityIndex = makeCityIndex();
  const hintMap = makeHintMap(worklist, cityIndex);
  const automator = loadAutomator();
  const mini = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${args.port}` });
  const staticCache = new Map();
  const output = [];

  try {
    for (let index = 0; index < selected.length; index += 1) {
      const row = selected[index];
      const hotel = row.hotel || '';
      const hints = (hintMap.get(normalizeKey(hotel)) || [])
        .map((hint) => ({ hint, city: resolveCity(cityIndex, hint.city, hint.state) }))
        .filter((item) => item.city)
        .sort((a, b) => b.hint.confidence - a.hint.confidence);

      if (!hints.length) {
        output.push({
          ...row,
          elong_match_status: 'needs_city',
          match_note: 'No reliable city/state hint or city id.',
        });
        console.error(`[${args.start + index + 1}/${worklist.length}] needs_city ${hotel}`);
        continue;
      }

      let top = null;
      let topHint = null;
      let topSecond = null;
      let topCandidates = [];
      let cityError = '';
      for (const item of hints.slice(0, 4)) {
        try {
          if (!staticCache.has(item.city.city_id)) {
            staticCache.set(item.city.city_id, await loadStaticHotels(mini, item.city, args.refreshStatic));
          }
          const staticHotels = staticCache.get(item.city.city_id).hotels || [];
          const match = bestMatch(hotel, staticHotels);
          if (match.best && (!top || match.best.score > top.score)) {
            top = match.best;
            topHint = item;
            topSecond = match.second;
            topCandidates = match.candidates;
          }
        } catch (error) {
          cityError = error.message || String(error);
        }
      }

      const fallbackHint = topHint || (hints[0] || null);
      let status = classifyMatch(top, topSecond);
      if (status === 'matched' && topHint && topHint.hint.ambiguous_city_token) status = 'needs_review';
      const matchedHotel = top && top.hotel;
      output.push({
        ...row,
        elong_hotel_id: status === 'matched' || status === 'needs_review' ? matchedHotel.HotelId : '',
        elong_match_status: status,
        elong_match_score: top ? top.score : '',
        elong_city_id: fallbackHint ? fallbackHint.city.city_id : '',
        elong_city: fallbackHint ? fallbackHint.city.city : '',
        elong_state: fallbackHint ? fallbackHint.city.state_label : '',
        city_hint_source: fallbackHint ? fallbackHint.hint.source : '',
        city_hint_confidence: fallbackHint ? fallbackHint.hint.confidence : '',
        elong_hotel_name: matchedHotel ? (matchedHotel.HotelNameEn || matchedHotel.HotelName || '') : '',
        elong_hotel_name_zh: matchedHotel ? (matchedHotel.HotelName || '') : '',
        second_match: topSecond ? `${topSecond.hotel.HotelId}:${topSecond.hotel.HotelNameEn || topSecond.hotel.HotelName || ''}:${topSecond.score}` : '',
        candidate_summary: topCandidates.map((item) => `${item.hotel.HotelId}:${item.hotel.HotelNameEn || item.hotel.HotelName || ''}:${item.score}`).join(' | '),
        match_note: status === 'no_match' && cityError ? cityError : '',
      });
      console.error(`[${args.start + index + 1}/${worklist.length}] ${status} ${hotel}${matchedHotel ? ` -> ${matchedHotel.HotelId}` : ''}`);
    }
  } finally {
    mini.disconnect();
  }

  const byKey = new Map(worklist.map((row) => [normalizeKey(row.hotel), { ...row }]));
  output.forEach((row) => byKey.set(normalizeKey(row.hotel), row));
  const enriched = worklist.map((row) => byKey.get(normalizeKey(row.hotel)) || row);
  fs.mkdirSync(args.outputDir, { recursive: true });

  const allJson = path.join(args.outputDir, 'elong-hotel-id-matches.json');
  const allCsv = path.join(args.outputDir, 'elong-hotel-id-matches.csv');
  const enrichedJson = path.join(args.outputDir, 'combined-hotel-elong-id-worklist.enriched.json');
  const enrichedCsv = path.join(args.outputDir, 'combined-hotel-elong-id-worklist.enriched.csv');
  fs.writeFileSync(allJson, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(enrichedJson, `${JSON.stringify(enriched, null, 2)}\n`);

  const columns = [
    'hotel', 'elong_hotel_id', 'elong_match_status', 'elong_match_score',
    'elong_city_id', 'elong_city', 'elong_state', 'city_hint_source',
    'historical_order_records', 'school_reference_trip_count', 'source_years',
    'elong_hotel_name', 'elong_hotel_name_zh', 'second_match', 'candidate_summary', 'match_note',
  ];
  writeCsv(allCsv, output, columns);
  writeCsv(enrichedCsv, enriched, columns);
  writeCsv(path.join(args.outputDir, 'elong-hotel-id-matched-only.csv'), enriched.filter((row) => row.elong_match_status === 'matched'), columns);
  writeCsv(path.join(args.outputDir, 'elong-hotel-id-needs-review.csv'), enriched.filter((row) => row.elong_match_status === 'needs_review'), columns);
  writeCsv(path.join(args.outputDir, 'elong-hotel-id-unmatched.csv'), enriched.filter((row) => ['needs_city', 'no_match'].includes(row.elong_match_status)), columns);

  const summary = enriched.reduce((acc, row) => {
    const status = row.elong_match_status || 'pending';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({
    input: args.input,
    processed_this_run: output.length,
    total_rows: enriched.length,
    summary,
    files: {
      allJson,
      allCsv,
      enrichedJson,
      enrichedCsv,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
