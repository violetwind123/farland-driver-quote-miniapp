const crypto = require('crypto');
const https = require('https');
const zlib = require('zlib');
const cloud = require('wx-server-sdk');
const SCHOOL_GUIDES = require('./schoolHotelGuides.json');
const ELONG_HOTEL_MATCHES = require('./elongHotelMatches.json');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const PREVIEWS_COLLECTION = 'hotel_order_previews';

// 鉴权:小程序调用一律带 OPENID,须为 active 用户;OPENID 缺失=管理端/脚本可信上下文(放行)。
// 挡掉未注册/被禁用户直连烧付费配额;为后续 per-openid 限频留钩子。
async function requireActiveCallerOrService() {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: true, openid: '' };
  const res = await db.collection('users').where({ openid: OPENID }).limit(1).get().catch(() => ({ data: [] }));
  const user = res.data && res.data[0];
  if (!user || user.status !== 'active') {
    return { ok: false, code: 403, error_code: 'FORBIDDEN', message: '无权限访问酒店搜索' };
  }
  return { ok: true, openid: OPENID, user };
}

const DEFAULT_VERSION = '1.62';
const DEFAULT_LOCAL = 'zh_CN';
const MAX_DETAIL_HOTELS = 5;
const MAX_SCHOOL_HOTELS = 8;
const CITY_LIST_PAGE_SIZE = 1000;
const MAX_CITY_LIST_PAGES = 120;
let cityListCache = null;
let cityListCacheAt = 0;

const ELONG_MATCHES_BY_KEY = (ELONG_HOTEL_MATCHES.matches || []).reduce((acc, match) => {
  const key = match.normalizedKey || normalizeSearchKey(match.hotelName);
  if (key && match.providerHotelId) acc[key] = match;
  return acc;
}, {});

const SUPPORTED_CITIES = [
  {
    key: 'boston',
    city_id: '110083599',
    display_name: 'Boston',
    display_name_zh: '波士顿',
    country_code: 'US',
    aliases: ['boston', '波士顿', 'bos'],
  },
  {
    key: 'new_york',
    city_id: '110080776',
    display_name: 'New York',
    display_name_zh: '纽约',
    country_code: 'US',
    aliases: ['newyork', 'new york', 'nyc', '纽约', '纽约市', '曼哈顿', 'manhattan'],
  },
];

const KNOWN_ELONG_CITIES = [
  { key: 'hartford_ct', city_id: '110087624', display_name: 'Hartford', display_name_zh: '哈特福德', state: 'Connecticut', country_code: 'US' },
  { key: 'south_windsor_ct', city_id: '110087653', display_name: 'South Windsor', display_name_zh: '南温莎', state: 'Connecticut', country_code: 'US' },
  { key: 'bloomfield_ct', city_id: '110087668', display_name: 'Bloomfield', display_name_zh: '布卢姆菲尔德', state: 'Connecticut', country_code: 'US' },
  { key: 'avon_ct', city_id: '110087678', display_name: 'Avon', display_name_zh: '埃文', state: 'Connecticut', country_code: 'US' },
  { key: 'east_windsor_ct', city_id: '110087681', display_name: 'East Windsor', display_name_zh: '东温莎', state: 'Connecticut', country_code: 'US' },
  { key: 'west_hartford_ct', city_id: '110087683', display_name: 'West Hartford', display_name_zh: '西哈特福特', state: 'Connecticut', country_code: 'US' },
  { key: 'simsbury_ct', city_id: '110087686', display_name: 'Simsbury', display_name_zh: '辛斯伯利', state: 'Connecticut', country_code: 'US' },
  { key: 'windsor_ct', city_id: '110087688', display_name: 'Windsor', display_name_zh: '温莎', state: 'Connecticut', country_code: 'US' },
  { key: 'windsor_locks_ct', city_id: '110087689', display_name: 'Windsor Locks', display_name_zh: '温莎洛克斯', state: 'Connecticut', country_code: 'US' },
  { key: 'farmington_ct', city_id: '110087690', display_name: 'Farmington', display_name_zh: '法明顿', state: 'Connecticut', country_code: 'US' },
];

const US_STATE_NAMES = {
  AL: 'alabama',
  AK: 'alaska',
  AZ: 'arizona',
  AR: 'arkansas',
  CA: 'california',
  CO: 'colorado',
  CT: 'connecticut',
  DE: 'delaware',
  DC: 'district of columbia',
  FL: 'florida',
  GA: 'georgia',
  HI: 'hawaii',
  ID: 'idaho',
  IL: 'illinois',
  IN: 'indiana',
  IA: 'iowa',
  KS: 'kansas',
  KY: 'kentucky',
  LA: 'louisiana',
  ME: 'maine',
  MD: 'maryland',
  MA: 'massachusetts',
  MI: 'michigan',
  MN: 'minnesota',
  MS: 'mississippi',
  MO: 'missouri',
  MT: 'montana',
  NE: 'nebraska',
  NV: 'nevada',
  NH: 'new hampshire',
  NJ: 'new jersey',
  NM: 'new mexico',
  NY: 'new york',
  NC: 'north carolina',
  ND: 'north dakota',
  OH: 'ohio',
  OK: 'oklahoma',
  OR: 'oregon',
  PA: 'pennsylvania',
  RI: 'rhode island',
  SC: 'south carolina',
  SD: 'south dakota',
  TN: 'tennessee',
  TX: 'texas',
  UT: 'utah',
  VT: 'vermont',
  VA: 'virginia',
  WA: 'washington',
  WV: 'west virginia',
  WI: 'wisconsin',
  WY: 'wyoming',
};

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function normalizeText(value) {
  return normalizeSearchKey(value);
}

function normalizeSearchKey(value) {
  return safeString(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

function resolveElongHotelMatch(hotelName) {
  return ELONG_MATCHES_BY_KEY[normalizeSearchKey(hotelName)] || null;
}

function searchTokens(value) {
  return safeString(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .map((token) => normalizeSearchKey(token))
    .filter((token) => token.length >= 2);
}

function md5(value) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex').toLowerCase();
}

function asPositiveInt(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  const normalized = Math.floor(parsed);
  return max ? Math.min(normalized, max) : normalized;
}

function compactObject(input) {
  return Object.keys(input).reduce((acc, key) => {
    const value = input[key];
    if (value === undefined || value === null || value === '') return acc;
    acc[key] = value;
    return acc;
  }, {});
}

function parseDate(value) {
  const text = safeString(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveCity(value) {
  const text = normalizeText(value);
  return SUPPORTED_CITIES.find((city) => city.aliases.some((alias) => normalizeText(alias) === text)) || null;
}

function stateSearchKeys(value) {
  const text = safeString(value).trim();
  if (!text) return [];
  const upper = text.toUpperCase();
  const keys = [normalizeSearchKey(text)];
  if (US_STATE_NAMES[upper]) keys.push(normalizeSearchKey(US_STATE_NAMES[upper]));
  Object.keys(US_STATE_NAMES).forEach((abbr) => {
    if (normalizeSearchKey(US_STATE_NAMES[abbr]) === normalizeSearchKey(text)) keys.push(normalizeSearchKey(abbr));
  });
  return Array.from(new Set(keys.filter(Boolean)));
}

function resolveKnownElongCity(cityName, state) {
  const query = normalizeSearchKey(cityName);
  if (!query) return null;
  const stateKeys = stateSearchKeys(state);
  return KNOWN_ELONG_CITIES.find((city) => {
    const cityNames = [
      city.display_name,
      city.display_name_zh,
      city.key,
    ].map((name) => normalizeSearchKey(name));
    if (!cityNames.some((name) => name === query)) return false;
    if (!stateKeys.length) return true;
    const knownStateKeys = stateSearchKeys(city.state);
    return stateKeys.some((key) => knownStateKeys.includes(key));
  }) || null;
}

function findArrayDeep(input, keys, depth = 0) {
  if (!input || depth > 4) return [];
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findArrayDeep(item, keys, depth + 1);
      if (found.length) return found;
    }
    return [];
  }
  if (typeof input !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(input[key])) return input[key];
  }
  for (const key of Object.keys(input)) {
    const found = findArrayDeep(input[key], keys, depth + 1);
    if (found.length) return found;
  }
  return [];
}

function decodeResponse(buffer, encoding) {
  return new Promise((resolve, reject) => {
    const normalized = safeString(encoding).toLowerCase();
    if (normalized.includes('br')) {
      zlib.brotliDecompress(buffer, (error, result) => (error ? reject(error) : resolve(result)));
      return;
    }
    if (normalized.includes('gzip')) {
      zlib.gunzip(buffer, (error, result) => (error ? reject(error) : resolve(result)));
      return;
    }
    if (normalized.includes('deflate')) {
      zlib.inflate(buffer, (error, result) => (error ? reject(error) : resolve(result)));
      return;
    }
    resolve(buffer);
  });
}

function getConfig() {
  const envName = safeString(process.env.ELONG_HOTEL_ENV || 'prod').trim().toLowerCase();
  const production = ['prod', 'production'].includes(envName);
  return {
    host: production ? 'api.elong.com' : 'api-test.elong.com',
    env_name: production ? 'prod' : 'test',
    user: safeString(process.env.ELONG_HOTEL_USER).trim(),
    app_key: safeString(process.env.ELONG_HOTEL_APP_KEY).trim(),
    secret_key: safeString(process.env.ELONG_HOTEL_SECRET_KEY).trim(),
    version: safeString(process.env.ELONG_HOTEL_VERSION || DEFAULT_VERSION).trim(),
    local: safeString(process.env.ELONG_HOTEL_LOCAL || DEFAULT_LOCAL).trim(),
    // 单次上游调用超时默认 8s(原 25s 在 3s 函数默认限制下必然整体超时);
    // 云函数执行超时须在控制台/发布配置提到 ~60s 才能覆盖多次串联调用。
    timeout_ms: asPositiveInt(process.env.ELONG_HOTEL_TIMEOUT_MS, 8000, 20000),
  };
}

function missingConfig(config) {
  const missing = [];
  if (!config.user) missing.push('ELONG_HOTEL_USER');
  if (!config.app_key) missing.push('ELONG_HOTEL_APP_KEY');
  if (!config.secret_key) missing.push('ELONG_HOTEL_SECRET_KEY');
  return missing;
}

function callElong(config, method, request) {
  return new Promise((resolve, reject) => {
    const dataText = JSON.stringify({
      Version: config.version,
      Local: config.local,
      Request: request,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = md5(`${timestamp}${md5(`${dataText}${config.app_key}`)}${config.secret_key}`);
    const query = [
      ['timestamp', timestamp],
      ['format', 'json'],
      ['method', method],
      ['signature', signature],
      ['user', config.user],
      ['data', dataText],
    ].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
    const req = https.request({
      hostname: config.host,
      path: `/rest?${query}`,
      method: 'GET',
      timeout: config.timeout_ms,
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'br,gzip',
        Connection: 'keep-alive',
        'User-Agent': 'FarlandMiniapp-ElongHotelSearch/1.0',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', async () => {
        try {
          const decoded = await decodeResponse(Buffer.concat(chunks), res.headers['content-encoding']);
          const bodyText = decoded.toString('utf8');
          const body = bodyText ? JSON.parse(bodyText) : {};
          resolve({ status_code: res.statusCode, body });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('ELONG_REQUEST_TIMEOUT')));
    req.on('error', reject);
    req.end();
  });
}

function arrayFrom(value, keys) {
  for (const key of keys) {
    if (Array.isArray(value && value[key])) return value[key];
  }
  return [];
}

function firstText(source, keys) {
  for (const key of keys) {
    const text = safeString(source && source[key]).trim();
    if (text) return text;
  }
  return '';
}

function firstNumber(source, keys) {
  for (const key of keys) {
    const parsed = Number(source && source[key]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function findDeepText(input, keys, depth = 0) {
  if (!input || depth > 4) return '';
  if (Array.isArray(input)) {
    for (const item of input) {
      const value = findDeepText(item, keys, depth + 1);
      if (value) return value;
    }
    return '';
  }
  if (typeof input !== 'object') return '';
  const direct = firstText(input, keys);
  if (direct) return direct;
  for (const key of Object.keys(input)) {
    const value = findDeepText(input[key], keys, depth + 1);
    if (value) return value;
  }
  return '';
}

function findDeepNumber(input, keys, depth = 0) {
  if (!input || depth > 4) return 0;
  if (Array.isArray(input)) {
    return input.reduce((min, item) => {
      const value = findDeepNumber(item, keys, depth + 1);
      if (!value) return min;
      return min ? Math.min(min, value) : value;
    }, 0);
  }
  if (typeof input !== 'object') return 0;
  const direct = firstNumber(input, keys);
  if (direct) return direct;
  return Object.keys(input).reduce((min, key) => {
    const value = findDeepNumber(input[key], keys, depth + 1);
    if (!value) return min;
    return min ? Math.min(min, value) : value;
  }, 0);
}

function formatMoney(amount, currency) {
  if (!amount) return '';
  const rounded = Math.round(amount * 100) / 100;
  return `${currency || ''} ${rounded}`.trim();
}

function normalizeDateOnly(value) {
  const text = safeString(value).trim();
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text;
}

function uniqueParts(values) {
  const seen = {};
  return values.map((value) => safeString(value).trim()).filter((value) => {
    const key = normalizeSearchKey(value);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function buildFullAddress(address, city, state, postalCode, country) {
  const base = safeString(address).trim();
  const normalizedBase = normalizeSearchKey(base);
  const extras = [
    city,
    state,
    postalCode,
    /^(us|usa|united states|美国)$/i.test(safeString(country).trim()) ? '' : country,
  ].filter((part) => {
    const normalized = normalizeSearchKey(part);
    return normalized && (!normalizedBase || !normalizedBase.includes(normalized));
  });
  return uniqueParts([base, ...extras]).join(', ');
}

function dateTimeOnDate(dateText, timeText, fallbackTime) {
  const date = normalizeDateOnly(dateText);
  const time = safeString(timeText || fallbackTime).trim();
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(time)) return time;
  if (/^\d{2}:\d{2}:\d{2}$/.test(time)) return `${date} ${time}`;
  return `${date} ${fallbackTime}`;
}

function ratePlansFromRoom(room) {
  return arrayFrom(room, ['RatePlans', 'RatePlanList'])
    .filter((rate) => rate && rate.Status !== false)
    .sort((a, b) => {
      const left = firstNumber(a, ['TotalRate', 'TotalPrice', 'Rate', 'Price', 'Amount', 'AverageRate']) || Number.MAX_SAFE_INTEGER;
      const right = firstNumber(b, ['TotalRate', 'TotalPrice', 'Rate', 'Price', 'Amount', 'AverageRate']) || Number.MAX_SAFE_INTEGER;
      return left - right;
    });
}

function bestRatePlan(room) {
  const plans = ratePlansFromRoom(room);
  return plans[0] || null;
}

function normalizeDayPriceList(rate) {
  return arrayFrom(rate, ['NightlyRates', 'DayPriceList', 'RateNightlyRateList'])
    .map((night) => compactObject({
      Date: normalizeDateOnly(firstText(night, ['Date', 'date'])),
      Price: firstNumber(night, ['Rate', 'Price', 'Member']),
      MinRate: firstNumber(night, ['MinRate']),
      BreakfastCount: firstNumber(night, ['BreakfastCount']),
    }))
    .filter((night) => night.Date && night.Price);
}

function boardText(rate) {
  const board = rate && rate.Board;
  if (!board) return '';
  return firstText(board, ['BoardDesc'])
    || arrayFrom(board, ['Boards', 'boardDetails'])
      .map((item) => firstText(item, ['Description']))
      .filter(Boolean)
      .join('、');
}

function mealText(rate) {
  return firstText(rate && rate.meals, ['mealCopyWriting'])
    || boardText(rate)
    || firstText(rate, ['Breakfast', 'BreakfastText', 'BoardDetail', 'Meals']);
}

function normalizeRateCard(room, rate, currency) {
  const roomName = firstText(room, ['Name', 'RoomName', 'RoomTypeName', 'RoomType', 'NameEn']) || '可订房型';
  const rateName = firstText(rate, ['RatePlanName']);
  const price = firstNumber(rate, ['TotalRate', 'TotalPrice', 'Rate', 'Price', 'Amount', 'AverageRate'])
    || findDeepNumber(room, ['TotalRate', 'TotalPrice', 'Rate', 'Price', 'Amount', 'AverageRate']);
  const dayPriceList = normalizeDayPriceList(rate);
  const effectiveCurrency = firstText(rate, ['CurrencyCode']) || currency || '';
  const prepay = rate && rate.PrepayResult ? rate.PrepayResult : {};
  return compactObject({
    room_id: firstText(room, ['RoomId', 'RoomTypeId', 'RoomTypeCode', 'Id']) || firstText(rate, ['RoomId']),
    room_type_id: firstText(rate, ['RoomTypeId', 'RoomTypeID']) || firstText(room, ['RoomTypeId', 'RoomTypeID']),
    rate_plan_id: firstText(rate, ['RatePlanId', 'RatePlanID', 'RatePlanCode', 'RateId', 'RateCode']),
    rate_plan_name: rateName,
    name: rateName ? `${roomName} · ${rateName}` : roomName,
    room_name: roomName,
    room_name_en: firstText(room, ['NameEn', 'RoomNameEn']),
    bed: firstText(rate, ['BedDescription', 'BedTypeAssociationalFilter'])
      || firstText(room, ['BedType', 'BedName', 'BedTypeName']),
    breakfast: mealText(rate),
    cancel_policy: firstText(prepay, ['CancelDescription', 'CancelTag'])
      || findDeepText(rate, ['CancelRule', 'CancelPolicy', 'CancelPolicyText', 'CancellationPolicy']),
    cancel_tag: firstText(prepay, ['CancelTag']),
    payment_type: firstText(rate, ['PaymentType', 'PayType']),
    price,
    total_price: price,
    average_rate: firstNumber(rate, ['AverageRate']),
    currency: effectiveCurrency,
    price_text: formatMoney(price, effectiveCurrency),
    current_allotment: firstNumber(rate, ['CurrentAlloment', 'CurrentAllotment', 'RestInventoryCount']),
    room_max_pax: firstNumber(rate, ['RoomMaxPax']),
    adult_occupancy_per_room: firstNumber(rate, ['AdultOccupancyPerRoom']),
    children_occupancy_per_room: firstNumber(rate, ['ChildrenOccupancyPerRoom']),
    little_majia_id: firstText(rate, ['Littlemajiaid', 'LittleMajiaId', 'LittleMajiaID']),
    goods_uniq_id: firstText(rate, ['GoodsUniqId', 'GoodsUniqueId']),
    need_majia_id: rate && rate.NeedMajiaId === false ? false : undefined,
    hotel_code: firstText(rate, ['HotelCode']),
    supplier_id: firstText(rate, ['SupplierId']),
    sub_supplier_id: firstText(rate, ['SubSupplierId']),
    shopper_product_id: firstText(rate, ['ShopperProductId']),
    day_price_list: dayPriceList,
    image_url: firstText(room, ['ImageUrl']),
    check_in_instructions: firstText(rate, ['CheckInInstructions']),
  });
}

function normalizeRoom(room, currency) {
  const rate = bestRatePlan(room);
  if (rate) return normalizeRateCard(room, rate, currency);
  const name = firstText(room, ['Name', 'RoomName', 'RoomTypeName', 'RoomType', 'NameEn']) || '可订房型';
  const price = findDeepNumber(room, ['TotalRate', 'TotalPrice', 'Rate', 'Price', 'Amount', 'AverageRate']);
  const bed = firstText(room, ['BedType', 'BedName', 'BedTypeName']);
  const breakfast = firstText(room, ['Breakfast', 'BreakfastText', 'BoardDetail', 'Meals']);
  return compactObject({
    room_id: firstText(room, ['RoomId', 'RoomTypeId', 'RoomTypeCode', 'Id']) || findDeepText(room, ['RoomId', 'RoomTypeId', 'RoomTypeCode']),
    rate_plan_id: findDeepText(room, ['RatePlanId', 'RatePlanID', 'RatePlanCode', 'RateId', 'RateCode']),
    name,
    bed,
    breakfast,
    cancel_policy: findDeepText(room, ['CancelRule', 'CancelPolicy', 'CancelPolicyText', 'CancellationPolicy']),
    payment_type: findDeepText(room, ['PaymentType', 'PayType']),
    price,
    price_text: formatMoney(price, currency),
  });
}

function normalizeHotel(detailHotel, staticHotel, fallbackCurrency, roomLimit = 3) {
  const detail = detailHotel.Detail || {};
  const currency = firstText(detailHotel, ['CurrencyCode']) || fallbackCurrency || '';
  const lowRate = firstNumber(detailHotel, ['LowRate', 'MinRate', 'Rate']);
  const address = firstText(detail, ['Address', 'AddressCn', 'AddressEn']);
  const city = firstText(detail, ['CityName', 'CityNameEn', 'City'])
    || firstText(detailHotel, ['CityName', 'CityNameEn', 'City'])
    || firstText(staticHotel, ['CityName', 'CityNameEn', 'City']);
  const state = firstText(detail, ['State', 'StateName', 'StateCode', 'Province', 'ProvinceName', 'ProvinceCode'])
    || firstText(detailHotel, ['State', 'StateName', 'StateCode', 'Province', 'ProvinceName', 'ProvinceCode'])
    || firstText(staticHotel, ['State', 'StateName', 'StateCode', 'Province', 'ProvinceName', 'ProvinceCode']);
  const postalCode = firstText(detail, ['PostalCode', 'ZipCode', 'Zip', 'PostCode'])
    || firstText(detailHotel, ['PostalCode', 'ZipCode', 'Zip', 'PostCode'])
    || firstText(staticHotel, ['PostalCode', 'ZipCode', 'Zip', 'PostCode']);
  const country = firstText(detail, ['CountryName', 'Country'])
    || firstText(detailHotel, ['CountryName', 'Country'])
    || firstText(staticHotel, ['CountryName', 'Country']);
  const rooms = arrayFrom(detailHotel, ['Rooms', 'RoomList'])
    .slice(0, roomLimit)
    .map((room) => normalizeRoom(room, currency));
  return compactObject({
    hotel_id: firstText(detailHotel, ['HotelId']) || firstText(staticHotel, ['HotelId']),
    name: firstText(detail, ['HotelName', 'Name'])
      || firstText(detailHotel, ['HotelName', 'Name'])
      || firstText(staticHotel, ['HotelName', 'Name']),
    name_en: firstText(detail, ['HotelNameEn', 'NameEn'])
      || firstText(detailHotel, ['HotelNameEn', 'NameEn'])
      || firstText(staticHotel, ['HotelNameEn', 'NameEn']),
    address,
    full_address: buildFullAddress(address, city, state, postalCode, country),
    city,
    state,
    postal_code: postalCode,
    country,
    star_rate: firstText(detail, ['StarRate', 'Category']),
    low_rate: lowRate,
    currency,
    price_text: formatMoney(lowRate, currency),
    rooms,
    source: 'elong',
  });
}

function schoolTextValues(school) {
  return [
    school.slug,
    school.schoolName,
    school.schoolNameZh,
    school.city,
    school.state,
    school.region,
  ].filter(Boolean);
}

function resolveSchool(value) {
  const rawQuery = safeString(value).trim();
  const query = normalizeSearchKey(rawQuery);
  if (!query) return null;
  const tokens = searchTokens(rawQuery);
  const best = SCHOOL_GUIDES.reduce((currentBest, school) => {
    const directValues = [school.slug, school.schoolName, school.schoolNameZh]
      .filter(Boolean)
      .map((item) => normalizeSearchKey(item));
    const haystack = normalizeSearchKey(schoolTextValues(school).join(' '));
    let score = 0;
    if (directValues.some((item) => item === query)) {
      score = 1000;
    } else if (directValues.some((item) => item.includes(query))) {
      score = 800 + query.length;
    } else if (haystack.includes(query)) {
      score = 600 + query.length;
    } else if (tokens.length && tokens.every((token) => haystack.includes(token))) {
      score = 500 + tokens.join('').length;
    }
    if (!score || (currentBest && currentBest.score >= score)) return currentBest;
    return { school, score };
  }, null);
  return best ? best.school : null;
}

function schoolHotelSearchText(hotel) {
  return normalizeSearchKey([
    hotel.name,
    hotel.type,
    hotel.group,
    hotel.sourceType,
    hotel.priceTier,
    hotel.priceBand,
    ...(Array.isArray(hotel.tags) ? hotel.tags : []),
  ].join(' '));
}

function priceBandFromMinMax(hotel) {
  const min = Number(hotel.priceMinUsd);
  const max = Number(hotel.priceMaxUsd);
  if (!Number.isFinite(min) || min <= 0) return '';
  if (!Number.isFinite(max) || max <= 0 || max === min) return `$${Math.round(min * 100) / 100}`;
  return `$${Math.round(min * 100) / 100}-${Math.round(max * 100) / 100}`;
}

function normalizeSchoolHotel(hotel, school, index) {
  const priceBand = firstText(hotel, ['priceBand']) || priceBandFromMinMax(hotel);
  const hotelCity = firstText(hotel, ['hotelCity']) || school.city;
  const hotelState = firstText(hotel, ['hotelState']) || school.state;
  const hotelAddress = firstText(hotel, ['hotelAddress']);
  const fullAddress = buildFullAddress(hotelAddress, hotelCity, hotelState);
  const matchedElongHotel = resolveElongHotelMatch(firstText(hotel, ['name']));
  return compactObject({
    hotel_id: `school_${school.slug}_${index}`,
    farland_hotel_id: `school_${school.slug}_${index}`,
    school_slug: school.slug,
    name: firstText(hotel, ['name']),
    name_en: firstText(hotel, ['name']),
    provider: matchedElongHotel ? 'elong' : '',
    provider_hotel_id: matchedElongHotel ? matchedElongHotel.providerHotelId : '',
    provider_hotel_name: matchedElongHotel ? matchedElongHotel.providerHotelName : '',
    provider_hotel_name_zh: matchedElongHotel ? matchedElongHotel.providerHotelNameZh : '',
    elong_hotel_id: matchedElongHotel ? matchedElongHotel.providerHotelId : '',
    elong_match_status: matchedElongHotel ? 'prelinked' : '',
    elong_match_verdict: matchedElongHotel ? matchedElongHotel.reviewVerdict : '',
    address: hotelAddress || [hotelCity, hotelState].filter(Boolean).join(', '),
    full_address: fullAddress || [hotelCity, hotelState].filter(Boolean).join(', '),
    hotel_city: hotelCity,
    hotel_state: hotelState,
    hotel_address: hotelAddress,
    type: firstText(hotel, ['type']),
    group: firstText(hotel, ['group']),
    distance: firstText(hotel, ['distance']),
    drive_time: firstText(hotel, ['driveTime']),
    reason: firstText(hotel, ['whyZh', 'whyEn']),
    source: 'farland_school_guide',
    source_type: firstText(hotel, ['sourceType']),
    price_tier: firstText(hotel, ['priceTier']),
    price_band: priceBand,
    price_text: priceBand,
    url: firstText(hotel, ['url']),
    verify_note: firstText(hotel, ['verifyNoteZh']),
    transit_risk_level: firstText(hotel, ['transitRiskLevel']),
    transit_note: firstText(hotel, ['transitNoteZh']),
    price_data_status: firstText(hotel, ['priceDataStatus']),
    booking_record_count: firstNumber(hotel, ['bookingRecordCount']),
    tags: Array.isArray(hotel.tags) ? hotel.tags : [],
  });
}

function filterSchoolLodging(school, keyword) {
  const query = normalizeSearchKey(keyword);
  const lodging = Array.isArray(school.lodging) ? school.lodging : [];
  if (!query) return lodging;
  const filtered = lodging.filter((hotel) => schoolHotelSearchText(hotel).includes(query));
  return filtered.length ? filtered : lodging;
}

function normalizeElongCity(rawCity) {
  const cityId = firstText(rawCity, ['CityId', 'city_id', 'Id', 'id']);
  const name = firstText(rawCity, ['CityName', 'CityNameEn', 'Name', 'NameEn', 'City', 'cityName', 'cityNameEn']);
  const nameZh = firstText(rawCity, ['CityNameCn', 'NameCn', 'CityNameZh', 'NameZh']);
  const countryCode = firstText(rawCity, ['CountryCode', 'country_code']);
  const state = firstText(rawCity, [
    'State',
    'StateCode',
    'StateName',
    'Province',
    'ProvinceName',
    'ProvinceNameEn',
    'ProvinceID',
    'ProvinceId',
    'ProvinceCode',
    'Region',
    'RegionName',
  ]);
  return compactObject({
    key: normalizeSearchKey(`${name}_${state}_${cityId}`),
    city_id: cityId,
    display_name: name || nameZh,
    display_name_zh: nameZh,
    state,
    country_code: countryCode,
    raw: rawCity,
  });
}

async function fetchElongCities(config) {
  const now = Date.now();
  if (cityListCache && now - cityListCacheAt < 24 * 60 * 60 * 1000) return cityListCache;
  const cities = [];
  for (let pageIndex = 1; pageIndex <= MAX_CITY_LIST_PAGES; pageIndex += 1) {
    const response = await callElong(config, 'hotel.static.city', {
      CountryType: 2,
      IsNeedLocation: true,
      PageSize: CITY_LIST_PAGE_SIZE,
      PageIndex: pageIndex,
    });
    const body = response.body || {};
    if (String(body.Code) !== '0') break;
    const result = body.Result || {};
    const pageCities = findArrayDeep(result, ['Cities', 'CityList', 'Citys', 'CityInfos', 'HotelCityList'])
      .map((item) => normalizeElongCity(item))
      .filter((item) => item.city_id && item.display_name);
    cities.push(...pageCities);
    const count = Number(result.Count || result.TotalCount || 0);
    if (!pageCities.length || pageCities.length < CITY_LIST_PAGE_SIZE || (count && cities.length >= count)) break;
  }
  // 仅在拿到城市时才缓存 24h;首页失败/空结果不写缓存,否则空数组被缓存一整天
  if (cities.length) {
    cityListCache = cities;
    cityListCacheAt = now;
  }
  return cities;
}

function cityMatchesState(city, state) {
  const keys = stateSearchKeys(state);
  if (!keys.length) return true;
  const stateText = normalizeSearchKey([
    city.state,
    city.raw && city.raw.State,
    city.raw && city.raw.StateName,
    city.raw && city.raw.StateCode,
    city.raw && city.raw.Province,
    city.raw && city.raw.ProvinceName,
    city.raw && city.raw.ProvinceNameEn,
    city.raw && city.raw.ProvinceID,
    city.raw && city.raw.ProvinceId,
    city.raw && city.raw.ProvinceCode,
    city.raw && city.raw.RegionName,
  ].filter(Boolean).join(' '));
  return Boolean(stateText) && keys.some((key) => stateText.includes(key));
}

async function resolveElongCityForPlace(config, cityName, state) {
  const direct = resolveCity(cityName);
  if (direct) return direct;
  const known = resolveKnownElongCity(cityName, state);
  if (known) return known;
  const query = normalizeSearchKey(cityName);
  if (!query) return null;
  const cities = await fetchElongCities(config);
  const matches = cities
    .map((city) => {
      const names = [
        city.display_name,
        city.display_name_zh,
        city.raw && city.raw.CityName,
        city.raw && city.raw.CityNameEn,
        city.raw && city.raw.Name,
        city.raw && city.raw.NameEn,
      ].filter(Boolean).map((name) => normalizeSearchKey(name));
      let score = 0;
      if (names.some((name) => name === query)) score = 1000;
      else if (names.some((name) => name.includes(query) || query.includes(name))) score = 700;
      if (!score) return null;
      if (cityMatchesState(city, state)) score += 100;
      return { city, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return matches[0] ? matches[0].city : null;
}

async function loadStaticHotels(config, city, pageSize) {
  const listResponse = await callElong(config, 'hotel.static.list', {
    CityId: city.city_id,
    PageSize: pageSize,
    PageIndex: 1,
  });
  const listBody = listResponse.body || {};
  if (String(listBody.Code) !== '0') {
    return {
      ok: false,
      code: listBody.Code || '',
      message: listBody.ErrorMessage || listBody.Message || '酒店列表查询失败',
      listBody,
    };
  }
  const listResult = listBody.Result || {};
  const hotels = arrayFrom(listResult, ['HotelIds', 'Hotels', 'HotelList'])
    .filter((hotel) => firstText(hotel, ['HotelId']))
    .filter((hotel) => {
      const status = safeString(hotel.HotelStatus);
      return !status || status === '0';
    });
  return {
    ok: true,
    listBody,
    listResult,
    hotels,
  };
}

function staticHotelNameText(hotel) {
  return normalizeSearchKey(`${hotel.HotelName || ''} ${hotel.HotelNameEn || ''}`);
}

function meaningfulNameTokens(value) {
  const stopWords = new Set(['the', 'and', 'hotel', 'inn', 'suites', 'suite', 'by', 'at', 'of', 'a']);
  return searchTokens(value).filter((token) => !stopWords.has(token));
}

function findStaticHotelMatch(schoolHotel, staticHotels) {
  const target = normalizeSearchKey(schoolHotel.name);
  const tokens = meaningfulNameTokens(schoolHotel.name);
  const best = staticHotels.reduce((currentBest, hotel) => {
    const text = staticHotelNameText(hotel);
    if (!target || !text) return currentBest;
    let score = 0;
    if (text === target) {
      score = 1000;
    } else if (text.includes(target) || target.includes(text)) {
      score = 850 - Math.abs(text.length - target.length);
    } else if (tokens.length) {
      const matched = tokens.filter((token) => text.includes(token)).length;
      const required = Math.min(2, tokens.length);
      if (matched >= required) score = 500 + matched * 20;
      if (tokens[0] && text.includes(tokens[0])) score += 160;
      if (tokens[1] && text.includes(tokens[0]) && text.includes(tokens[1])) score += 80;
    }
    if (!score || (currentBest && currentBest.score >= score)) return currentBest;
    return { hotel, score };
  }, null);
  return best ? best.hotel : null;
}

function mergeSchoolAndElongHotel(schoolHotel, elongHotel) {
  const rooms = Array.isArray(elongHotel.rooms) ? elongHotel.rooms : [];
  const address = elongHotel.address || schoolHotel.address;
  const city = elongHotel.city || schoolHotel.hotel_city || schoolHotel.city;
  const state = elongHotel.state || schoolHotel.hotel_state || schoolHotel.state;
  const postalCode = elongHotel.postal_code || schoolHotel.postal_code;
  const country = elongHotel.country || schoolHotel.country;
  return compactObject({
    ...schoolHotel,
    hotel_id: elongHotel.hotel_id || schoolHotel.hotel_id,
    provider: 'elong',
    provider_hotel_id: elongHotel.hotel_id || schoolHotel.provider_hotel_id,
    elong_hotel_id: elongHotel.hotel_id,
    address,
    full_address: buildFullAddress(address, city, state, postalCode, country) || schoolHotel.full_address,
    city,
    state,
    postal_code: postalCode,
    country,
    star_rate: elongHotel.star_rate,
    low_rate: elongHotel.low_rate,
    currency: elongHotel.currency,
    price_text: elongHotel.price_text || schoolHotel.price_text,
    live_price_text: elongHotel.price_text,
    rooms,
    source: 'farland_school_guide+elong',
  });
}

async function enrichSchoolHotelsWithElong(config, school, schoolHotels, params) {
  const results = [];
  let detailCount = 0;
  let cityResolveCount = 0;
  let staticMatchCount = 0;
  let prelinkedMatchCount = 0;
  let lastCity = null;
  const staticListsByCityId = {};

  for (const schoolHotel of schoolHotels) {
    const prelinkedHotelId = firstText(schoolHotel, ['elong_hotel_id', 'provider_hotel_id']);
    if (prelinkedHotelId) {
      prelinkedMatchCount += 1;
      if (detailCount < MAX_DETAIL_HOTELS) {
        try {
          const detail = await detailForHotel(config, {
            HotelId: prelinkedHotelId,
            HotelName: schoolHotel.provider_hotel_name || schoolHotel.name,
            HotelNameEn: schoolHotel.provider_hotel_name || schoolHotel.name_en || schoolHotel.name,
          }, params);
          if (detail.ok) {
            detailCount += 1;
            results.push(mergeSchoolAndElongHotel({
              ...schoolHotel,
              elong_match_status: 'prelinked_live_detail',
            }, detail.hotel));
            continue;
          }
        } catch (error) {
          // Fall back to the city/static matching path if a prelinked ID cannot be priced.
        }
      } else {
        results.push(schoolHotel);
        continue;
      }
    }

    const city = await resolveElongCityForPlace(
      config,
      schoolHotel.hotel_city || school.city,
      schoolHotel.hotel_state || school.state,
    );
    if (city) {
      cityResolveCount += 1;
      lastCity = lastCity || city;
    }
    if (!city || detailCount >= MAX_DETAIL_HOTELS) {
      results.push(schoolHotel);
      continue;
    }

    if (!staticListsByCityId[city.city_id]) {
      staticListsByCityId[city.city_id] = await loadStaticHotels(config, city, 2000);
    }
    const list = staticListsByCityId[city.city_id];
    if (!list.ok) {
      results.push(schoolHotel);
      continue;
    }

    const staticHotel = findStaticHotelMatch(schoolHotel, list.hotels);
    if (!staticHotel) {
      results.push(schoolHotel);
      continue;
    }
    staticMatchCount += 1;
    try {
      const detail = await detailForHotel(config, staticHotel, params);
      if (detail.ok) {
        detailCount += 1;
        results.push(mergeSchoolAndElongHotel(schoolHotel, detail.hotel));
        continue;
      }
    } catch (error) {
      // Keep Farland's curated recommendation even if live pricing is unavailable.
    }
    results.push(schoolHotel);
  }

  return {
    status: detailCount ? 'live_price_enriched' : (staticMatchCount ? 'static_match_no_detail' : 'no_static_match'),
    city: lastCity,
    results,
    total_static_count: Object.values(staticListsByCityId).reduce((sum, list) => {
      if (!list || !list.ok) return sum;
      return sum + Number(list.listResult.Count || 0);
    }, 0),
    detail_count: detailCount,
    city_resolve_count: cityResolveCount,
    static_match_count: staticMatchCount,
    prelinked_match_count: prelinkedMatchCount,
  };
}

async function searchSchoolHotels(event) {
  const school = resolveSchool(event.school || event.school_name || event.city || event.destination);
  if (!school) {
    return {
      success: false,
      code: 422,
      error_code: 'SCHOOL_NOT_FOUND',
      message: '暂未找到这个学校，请输入学校英文名或中文名',
      school_count: SCHOOL_GUIDES.length,
    };
  }

  const checkIn = parseDate(event.check_in_date);
  const checkOut = parseDate(event.check_out_date);
  if (!checkIn || !checkOut || checkOut.getTime() <= checkIn.getTime()) {
    return { success: false, code: 422, error_code: 'INVALID_DATE_RANGE', message: '请选择有效入住和离店日期' };
  }

  const rooms = asPositiveInt(event.rooms, 1, 4);
  const guests = asPositiveInt(event.guests, 2, 12);
  const adultsPerRoom = Math.max(1, Math.ceil(guests / rooms));
  const keyword = safeString(event.keyword || event.location_preference).trim();
  const lodging = filterSchoolLodging(school, keyword);
  const schoolHotels = lodging
    .slice(0, MAX_SCHOOL_HOTELS)
    .map((hotel, index) => normalizeSchoolHotel(hotel, school, index));

  const config = getConfig();
  const missing = missingConfig(config);
  let enrichment = {
    status: missing.length ? 'config_missing' : 'not_attempted',
    city: null,
    results: schoolHotels,
  };
  if (!missing.length && schoolHotels.length) {
    try {
      enrichment = await enrichSchoolHotelsWithElong(config, school, schoolHotels, {
        check_in_date: event.check_in_date,
        check_out_date: event.check_out_date,
        rooms,
        adults_per_room: adultsPerRoom,
      });
    } catch (error) {
      enrichment = {
        status: 'live_price_failed',
        city: null,
        results: schoolHotels,
        message: error.message || 'live_price_failed',
      };
    }
  }

  return {
    success: true,
    code: 0,
    mode: 'campus',
    school: {
      slug: school.slug,
      name: school.schoolName,
      name_zh: school.schoolNameZh,
      city: school.city,
      state: school.state,
      region: school.region,
      status: school.status,
      last_checked: school.lastChecked,
    },
    city: enrichment.city ? {
      key: enrichment.city.key,
      city_id: enrichment.city.city_id,
      name: enrichment.city.display_name,
      name_zh: enrichment.city.display_name_zh,
    } : null,
    search: {
      check_in_date: event.check_in_date,
      check_out_date: event.check_out_date,
      rooms,
      guests,
      adults_per_room: adultsPerRoom,
      keyword,
    },
    total_school_hotel_count: (school.lodging || []).length,
    matched_school_hotel_count: lodging.length,
    total_static_count: enrichment.total_static_count || 0,
    live_price_status: enrichment.status,
    live_detail_count: enrichment.detail_count || 0,
    city_resolve_count: enrichment.city_resolve_count || 0,
    static_match_count: enrichment.static_match_count || 0,
    prelinked_match_count: enrichment.prelinked_match_count || 0,
    results: enrichment.results || schoolHotels,
  };
}

async function fetchDetailHotel(config, hotel, params) {
  const detailRequest = compactObject({
    ArrivalDate: params.check_in_date,
    DepartureDate: params.check_out_date,
    LatestArrivalTime: params.latest_arrival_time,
    PaymentType: 'All',
    HotelIds: hotel.HotelId,
    RoomTypeId: params.room_type_id || hotel.RoomTypeId,
    RatePlanId: params.rate_plan_id || hotel.RatePlanId,
    NumberOfAdults: params.adults_per_room,
    NumberOfRooms: params.rooms,
    SaveMajiaId: true,
    Options: params.rooms > 1 ? '1,2,4,12,13' : '1,2,4,12',
  });
  const response = await callElong(config, 'hotel.detail', detailRequest);
  const body = response.body || {};
  if (String(body.Code) !== '0') {
    return { ok: false, hotel, code: body.Code || '', message: body.ErrorMessage || body.Message || '' };
  }
  const result = body.Result || {};
  const hotels = arrayFrom(result, ['Hotels', 'HotelList']);
  const detailHotel = hotels[0] || {};
  return {
    ok: true,
    guid: body.Guid || '',
    detailHotel,
  };
}

async function detailForHotel(config, hotel, params) {
  const detail = await fetchDetailHotel(config, hotel, params);
  if (!detail.ok) return detail;
  return {
    ok: true,
    guid: detail.guid || '',
    hotel: normalizeHotel(detail.detailHotel, hotel, detail.detailHotel.CurrencyCode, params.room_limit || 3),
  };
}

async function searchHotelDetail(event) {
  const hotelId = firstText(event, ['elong_hotel_id', 'provider_hotel_id', 'hotel_id', 'HotelId']);
  if (!hotelId || normalizeSearchKey(hotelId).indexOf('school') === 0) {
    return {
      success: false,
      code: 422,
      error_code: 'HOTEL_ID_REQUIRED',
      message: '请先选择可查询实时房态的酒店',
    };
  }

  const checkIn = parseDate(event.check_in_date);
  const checkOut = parseDate(event.check_out_date);
  if (!checkIn || !checkOut || checkOut.getTime() <= checkIn.getTime()) {
    return { success: false, code: 422, error_code: 'INVALID_DATE_RANGE', message: '请选择有效入住和离店日期' };
  }

  const rooms = asPositiveInt(event.rooms, 1, 4);
  const guests = asPositiveInt(event.guests, 2, 12);
  const adultsPerRoom = Math.max(1, Math.ceil(guests / rooms));
  const config = getConfig();
  const missing = missingConfig(config);
  if (missing.length) {
    return { success: false, code: 500, error_code: 'ELONG_CONFIG_MISSING', message: '酒店供应商接口环境变量未配置完整', missing_env: missing };
  }

  const detail = await detailForHotel(config, {
    HotelId: hotelId,
    HotelName: event.hotel_name || event.provider_hotel_name || event.name,
    HotelNameEn: event.hotel_name_en || event.provider_hotel_name || event.name_en || event.name,
  }, {
    check_in_date: event.check_in_date,
    check_out_date: event.check_out_date,
    rooms,
    adults_per_room: adultsPerRoom,
    room_limit: 8,
  });

  if (!detail.ok) {
    return {
      success: false,
      code: 502,
      error_code: 'ELONG_DETAIL_FAILED',
      message: detail.message || '酒店详情查询失败',
      elong_code: detail.code || '',
      hotel_id: hotelId,
    };
  }

  const hotel = compactObject({
    ...detail.hotel,
    hotel_id: detail.hotel.hotel_id || hotelId,
    farland_hotel_id: event.farland_hotel_id,
    school_slug: event.school_slug,
    provider: 'elong',
    provider_hotel_id: detail.hotel.hotel_id || hotelId,
    elong_hotel_id: detail.hotel.hotel_id || hotelId,
    address: detail.hotel.address || event.address || event.hotel_address,
    full_address: buildFullAddress(
      detail.hotel.address || event.address || event.hotel_address,
      detail.hotel.city || event.hotel_city || event.city,
      detail.hotel.state || event.hotel_state || event.state,
      detail.hotel.postal_code || event.postal_code || event.zip,
      detail.hotel.country || event.country,
    ),
    city: detail.hotel.city || event.hotel_city || event.city,
    state: detail.hotel.state || event.hotel_state || event.state,
    postal_code: detail.hotel.postal_code || event.postal_code || event.zip,
    country: detail.hotel.country || event.country,
    distance: event.distance,
    drive_time: event.drive_time,
    reason: event.reason,
    source_type: event.source_type,
    price_band: event.price_band,
    reference_price_text: event.reference_price_text || event.price_text || event.price_band,
    source: 'elong_detail',
  });

  return {
    success: true,
    code: 0,
    mode: 'detail',
    guid: detail.guid || '',
    live_price_status: hotel.rooms && hotel.rooms.length ? 'live_detail_with_rooms' : 'live_detail_no_rooms',
    search: {
      check_in_date: event.check_in_date,
      check_out_date: event.check_out_date,
      rooms,
      guests,
      adults_per_room: adultsPerRoom,
    },
    hotel,
    rooms: hotel.rooms || [],
  };
}

function findMatchingRateCard(detailHotel, criteria) {
  const rooms = arrayFrom(detailHotel, ['Rooms', 'RoomList']);
  const targetRoomId = safeString(criteria.room_id).trim();
  const targetRoomTypeId = safeString(criteria.room_type_id).trim();
  const targetRatePlanId = safeString(criteria.rate_plan_id).trim();
  const targetGoodsUniqId = safeString(criteria.goods_uniq_id).trim();

  for (const room of rooms) {
    const roomId = firstText(room, ['RoomId']);
    for (const rate of ratePlansFromRoom(room)) {
      const card = normalizeRateCard(room, rate, firstText(detailHotel, ['CurrencyCode']));
      const roomMatches = !targetRoomId || card.room_id === targetRoomId || roomId === targetRoomId;
      const roomTypeMatches = !targetRoomTypeId || card.room_type_id === targetRoomTypeId;
      const rateMatches = !targetRatePlanId || safeString(card.rate_plan_id) === targetRatePlanId;
      const goodsMatches = !targetGoodsUniqId || card.goods_uniq_id === targetGoodsUniqId;
      if (targetGoodsUniqId && goodsMatches && roomMatches && rateMatches) return card;
      if (!targetGoodsUniqId && roomMatches && roomTypeMatches && rateMatches) return card;
    }
  }
  return null;
}

function buildValidateRequestFromRate(event, params, rate) {
  return compactObject({
    ArrivalDate: params.check_in_date,
    DepartureDate: params.check_out_date,
    EarliestArrivalTime: dateTimeOnDate(params.check_in_date, event.earliest_arrival_time, '14:00:00'),
    LatestArrivalTime: dateTimeOnDate(params.check_in_date, event.latest_arrival_time, '23:59:00'),
    HotelId: params.hotel_id,
    RoomId: rate.room_id,
    RoomTypeID: rate.room_type_id,
    RatePlanId: rate.rate_plan_id,
    TotalPrice: rate.total_price || rate.price,
    NumberOfRooms: params.rooms,
    LittleMajiaId: rate.little_majia_id,
    GoodsUniqId: rate.goods_uniq_id,
    NumberOfAdults: params.adults_per_room,
    HotelCode: rate.hotel_code,
    SupplierId: rate.supplier_id,
    SubSupplierId: rate.sub_supplier_id,
    ShopperProductId: rate.shopper_product_id,
    CurrencyCode: rate.currency,
    DayPriceList: rate.day_price_list,
  });
}

function sumNightlyRates(nightlyRates, rooms) {
  const total = (nightlyRates || []).reduce((sum, night) => {
    const amount = firstNumber(night, ['Rate', 'Price']);
    return sum + amount;
  }, 0);
  return Math.round(total * rooms * 100) / 100;
}

function roundMoney(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 100) / 100;
}

function normalizePreviewNightlyRates(rateInfo, rate, params, currency) {
  const rawNights = arrayFrom(rateInfo, ['RateNightlyRateList'])
    .map((night) => ({
      date: normalizeDateOnly(firstText(night, ['Date', 'date'])),
      rate: firstNumber(night, ['Rate', 'Price', 'Member']),
      min_rate: firstNumber(night, ['MinRate']),
    }))
    .filter((night) => night.date && night.rate);
  const nights = rawNights.length
    ? rawNights
    : (rate.day_price_list || []).map((night) => ({
      date: normalizeDateOnly(firstText(night, ['Date', 'date'])),
      rate: firstNumber(night, ['Price', 'Rate', 'Member']),
      min_rate: firstNumber(night, ['MinRate']),
    })).filter((night) => night.date && night.rate);

  return nights.map((night) => {
    const amount = roundMoney(night.rate * params.rooms);
    return compactObject({
      date: night.date,
      rate: roundMoney(night.rate),
      rooms: params.rooms,
      amount,
      currency,
      rate_text: formatMoney(night.rate, currency),
      amount_text: formatMoney(amount, currency),
    });
  });
}

function sumNightlyRows(nightlyRows) {
  return roundMoney((nightlyRows || []).reduce((sum, night) => sum + Number(night.amount || 0), 0));
}

function resolvePreviewPayableTotal(result, rateInfo, roomTotal) {
  return firstNumber(result, ['PayableTotal', 'PayableAmount', 'OrderAmount', 'TotalAmount', 'TotalPrice', 'Amount'])
    || firstNumber(rateInfo, ['PayableTotal', 'PayableAmount', 'OrderAmount', 'TotalAmount', 'TotalPrice', 'TotalRate', 'Amount'])
    || roomTotal;
}

function resolvePreviewTaxesAndFees(result, rateInfo, payableTotal, roomTotal) {
  const explicit = firstNumber(result, ['TaxesAndFees', 'TaxAndFee', 'TaxFee', 'TaxAmount', 'TotalTax', 'ServiceFee', 'Surcharge', 'TotalFee'])
    || firstNumber(rateInfo, ['TaxesAndFees', 'TaxAndFee', 'TaxFee', 'TaxAmount', 'TotalTax', 'ServiceFee', 'Surcharge', 'TotalFee']);
  if (explicit && explicit < payableTotal) return roundMoney(explicit);
  if (payableTotal > roomTotal) return roundMoney(payableTotal - roomTotal);
  return 0;
}

function normalizePreviewResult(body, rate, params, request) {
  const result = body.Result || {};
  const info = result.interValidateInfo || {};
  const orderHotel = info.orderHotel || {};
  const rateInfo = info.ratePlanInfo || {};
  const currency = firstText(rateInfo, ['CurrencyCode']) || firstText(result, ['CurrencyCode']) || rate.currency || '';
  const nightlyRates = normalizePreviewNightlyRates(rateInfo, rate, params, currency);
  const roomTotal = sumNightlyRows(nightlyRates) || Number(rate.total_price || rate.price || 0);
  const payableTotal = roundMoney(resolvePreviewPayableTotal(result, rateInfo, roomTotal));
  const taxesAndFees = resolvePreviewTaxesAndFees(result, rateInfo, payableTotal, roomTotal);
  const resultCode = firstText(result, ['ResultCode']);
  const now = Date.now();
  const lockExpiresAt = new Date(now + 15 * 60 * 1000).toISOString();
  const previewId = `prev_${now}_${md5(`${params.hotel_id}_${rate.room_type_id}_${rate.rate_plan_id}_${rate.goods_uniq_id || ''}`).slice(0, 8)}`;
  const priceChanged = Boolean(roomTotal && rate.total_price && Math.abs(Number(rate.total_price) - roomTotal) >= 0.01);
  return {
    preview_id: previewId,
    lock_expires_at: lockExpiresAt,
    result_code: resultCode,
    bookable: resultCode === 'OK',
    price_changed: priceChanged,
    hotel: compactObject({
      hotel_id: firstText(orderHotel, ['HotelId']) || params.hotel_id,
      name: firstText(orderHotel, ['Name']),
      name_en: firstText(orderHotel, ['HotelEnglishName']),
      address: firstText(orderHotel, ['Address', 'AddressEn']),
      city: firstText(orderHotel, ['CityName']),
      state: firstText(orderHotel, ['State', 'StateName', 'StateCode', 'Province', 'ProvinceName', 'ProvinceCode']),
      postal_code: firstText(orderHotel, ['PostalCode', 'ZipCode', 'Zip', 'PostCode']),
      country: firstText(orderHotel, ['HotelCountryName']),
      full_address: buildFullAddress(
        firstText(orderHotel, ['Address', 'AddressEn']),
        firstText(orderHotel, ['CityName']),
        firstText(orderHotel, ['State', 'StateName', 'StateCode', 'Province', 'ProvinceName', 'ProvinceCode']),
        firstText(orderHotel, ['PostalCode', 'ZipCode', 'Zip', 'PostCode']),
        firstText(orderHotel, ['HotelCountryName']),
      ),
      phone: firstText(orderHotel, ['Phone']),
      star: firstNumber(orderHotel, ['Star']),
    }),
    rate: compactObject({
      ...rate,
      rate_plan_name: firstText(rateInfo, ['RatePlanName']) || rate.rate_plan_name,
      room_name: firstText(rateInfo, ['RoomName']) || rate.room_name,
      room_name_en: firstText(rateInfo, ['RoomNameEn']) || rate.room_name_en,
      cancel_policy: firstText(rateInfo, ['CancelDescription']) || rate.cancel_policy,
      cancel_tag: firstText(rateInfo, ['CancelName']) || rate.cancel_tag,
      current_allotment: firstNumber(rateInfo, ['RestInventoryCount']) || rate.current_allotment,
      check_in_instructions: firstText(rateInfo, ['CheckInInstructions']) || rate.check_in_instructions,
    }),
    price: {
      currency,
      room_total: roomTotal,
      nightly_rates: nightlyRates,
      taxes_and_fees: taxesAndFees,
      farland_service_fee: 0,
      payable_total: payableTotal,
      payable_text: formatMoney(payableTotal, currency),
      lines: [
        { key: 'room_total', label: '房费小计', amount: roomTotal, amount_text: formatMoney(roomTotal, currency) },
        { key: 'taxes_and_fees', label: '税费/酒店服务费', amount: taxesAndFees, amount_text: taxesAndFees ? formatMoney(taxesAndFees, currency) : '已含在应付总额' },
        { key: 'service_fee', label: 'Farland 服务费', amount: 0, amount_text: formatMoney(0, currency) || `${currency} 0`.trim() },
      ],
    },
    cancellation: compactObject({
      name: firstText(rateInfo, ['CancelName']) || rate.cancel_tag,
      description: firstText(rateInfo, ['CancelDescription']) || rate.cancel_policy,
      free_cancel_time: firstText(result, ['FreeCancelTime']),
      cancel_time: firstText(result, ['CancelTime']),
      penalty_amount: firstNumber(result, ['PenaltyAmount']),
      policies: arrayFrom(rateInfo, ['CancelPolicyList']),
    }),
    request_snapshot: request,
    provider_guid: body.Guid || '',
  };
}

async function searchHotelPreview(event, openid = '') {
  const hotelId = firstText(event, ['elong_hotel_id', 'provider_hotel_id', 'hotel_id', 'HotelId']);
  const room = event.room || event.selected_room || {};
  const checkIn = parseDate(event.check_in_date);
  const checkOut = parseDate(event.check_out_date);
  if (!hotelId || normalizeSearchKey(hotelId).indexOf('school') === 0) {
    return { success: false, code: 422, error_code: 'HOTEL_ID_REQUIRED', message: '请先选择可查询实时房态的酒店' };
  }
  if (!checkIn || !checkOut || checkOut.getTime() <= checkIn.getTime()) {
    return { success: false, code: 422, error_code: 'INVALID_DATE_RANGE', message: '请选择有效入住和离店日期' };
  }
  const roomTypeId = firstText(event, ['room_type_id', 'RoomTypeID']) || firstText(room, ['room_type_id', 'RoomTypeID']);
  const ratePlanId = firstText(event, ['rate_plan_id', 'RatePlanId']) || firstText(room, ['rate_plan_id', 'RatePlanId']);
  if (!roomTypeId || !ratePlanId) {
    return { success: false, code: 422, error_code: 'RATE_REQUIRED', message: '请选择有效房型后再提交预览' };
  }

  const rooms = asPositiveInt(event.rooms, 1, 4);
  const guests = asPositiveInt(event.guests, 2, 12);
  const adultsPerRoom = Math.max(1, Math.ceil(guests / rooms));
  const params = {
    hotel_id: hotelId,
    check_in_date: event.check_in_date,
    check_out_date: event.check_out_date,
    rooms,
    guests,
    adults_per_room: adultsPerRoom,
  };
  const config = getConfig();
  const missing = missingConfig(config);
  if (missing.length) {
    return { success: false, code: 500, error_code: 'ELONG_CONFIG_MISSING', message: '酒店供应商接口环境变量未配置完整', missing_env: missing };
  }

  const latestArrivalTime = dateTimeOnDate(event.check_in_date, event.latest_arrival_time, '23:59:00');
  const detail = await fetchDetailHotel(config, {
    HotelId: hotelId,
    RoomTypeId: roomTypeId,
    RatePlanId: ratePlanId,
  }, {
    check_in_date: event.check_in_date,
    check_out_date: event.check_out_date,
    latest_arrival_time: latestArrivalTime,
    rooms,
    adults_per_room: adultsPerRoom,
    room_type_id: roomTypeId,
    rate_plan_id: ratePlanId,
  });
  if (!detail.ok) {
    return {
      success: false,
      code: 502,
      error_code: 'ELONG_DETAIL_FAILED',
      message: detail.message || '酒店详情查询失败',
      elong_code: detail.code || '',
    };
  }

  const matchedRate = findMatchingRateCard(detail.detailHotel, {
    room_id: firstText(event, ['room_id']) || firstText(room, ['room_id']),
    room_type_id: roomTypeId,
    rate_plan_id: ratePlanId,
    goods_uniq_id: firstText(room, ['goods_uniq_id']),
  });
  if (!matchedRate) {
    return { success: false, code: 409, error_code: 'RATE_UNAVAILABLE', message: '该房型已售罄或价格已更新，请返回重新选择房型' };
  }

  const validateRequest = buildValidateRequestFromRate(event, params, matchedRate);
  const response = await callElong(config, 'hotel.data.validate', validateRequest);
  const body = response.body || {};
  if (String(body.Code) !== '0') {
    return {
      success: false,
      code: 502,
      error_code: 'ELONG_VALIDATE_FAILED',
      message: body.ErrorMessage || body.Message || '酒店供应商试单失败',
      elong_code: body.Code || '',
    };
  }

  const preview = normalizePreviewResult(body, matchedRate, params, validateRequest);
  // 服务端持久化 preview:下单时按 preview_id 回查用存储价,杜绝客户端改价下单
  if (preview.bookable && preview.preview_id) {
    await db.collection(PREVIEWS_COLLECTION).doc(preview.preview_id).set({
      data: {
        preview_id: preview.preview_id,
        openid,
        hotel_id: hotelId,
        hotel: preview.hotel,
        rate: preview.rate,
        price: preview.price,
        cancellation: preview.cancellation,
        search: {
          check_in_date: event.check_in_date,
          check_out_date: event.check_out_date,
          rooms,
          guests,
          adults_per_room: adultsPerRoom,
        },
        lock_expires_at: preview.lock_expires_at,
        created_at: new Date().toISOString(),
      },
    }).catch(() => null);
  }
  return {
    success: preview.bookable,
    code: preview.bookable ? 0 : 409,
    mode: 'preview',
    error_code: preview.bookable ? '' : `RATE_${preview.result_code || 'UNAVAILABLE'}`,
    message: preview.bookable ? '' : '该房型当前不可预订，请返回重新选择',
    preview,
    search: {
      check_in_date: event.check_in_date,
      check_out_date: event.check_out_date,
      rooms,
      guests,
      adults_per_room: adultsPerRoom,
      earliest_arrival_time: validateRequest.EarliestArrivalTime,
      latest_arrival_time: validateRequest.LatestArrivalTime,
    },
  };
}

exports.main = async (event = {}) => {
  const auth = await requireActiveCallerOrService();
  if (!auth.ok) {
    return { success: false, code: auth.code, error_code: auth.error_code, message: auth.message };
  }
  const mode = safeString(event.mode || event.search_mode).trim().toLowerCase();
  if (['preview', 'rate_preview', 'validate'].includes(mode)) {
    return searchHotelPreview(event, auth.openid);
  }
  if (['detail', 'hotel_detail', 'rates', 'rate'].includes(mode)) {
    return searchHotelDetail(event);
  }
  if (['campus', 'school', 'school_hotels'].includes(mode) || event.school || event.school_name) {
    return searchSchoolHotels(event);
  }

  const city = resolveCity(event.city || event.destination);
  if (!city) {
    return {
      success: false,
      code: 422,
      error_code: 'CITY_NOT_SUPPORTED',
      message: '当前酒店搜索先开放纽约和波士顿',
      supported_cities: SUPPORTED_CITIES.map((item) => ({
        key: item.key,
        name: item.display_name,
        name_zh: item.display_name_zh,
      })),
    };
  }

  const checkIn = parseDate(event.check_in_date);
  const checkOut = parseDate(event.check_out_date);
  if (!checkIn || !checkOut || checkOut.getTime() <= checkIn.getTime()) {
    return { success: false, code: 422, error_code: 'INVALID_DATE_RANGE', message: '请选择有效入住和离店日期' };
  }

  const rooms = asPositiveInt(event.rooms, 1, 4);
  const guests = asPositiveInt(event.guests, 2, 12);
  const adultsPerRoom = Math.max(1, Math.ceil(guests / rooms));
  const keyword = safeString(event.keyword || event.location_preference).trim().toLowerCase();
  const config = getConfig();
  const missing = missingConfig(config);
  if (missing.length) {
    return { success: false, code: 500, error_code: 'ELONG_CONFIG_MISSING', message: '酒店供应商接口环境变量未配置完整', missing_env: missing };
  }

  const listResponse = await callElong(config, 'hotel.static.list', {
    CityId: city.city_id,
    PageSize: 500,
    PageIndex: 1,
  });
  const listBody = listResponse.body || {};
  if (String(listBody.Code) !== '0') {
    return {
      success: false,
      code: 502,
      error_code: 'ELONG_STATIC_LIST_FAILED',
      message: listBody.ErrorMessage || listBody.Message || '酒店列表查询失败',
      elong_code: listBody.Code || '',
    };
  }

  const listResult = listBody.Result || {};
  const hotels = arrayFrom(listResult, ['HotelIds', 'Hotels', 'HotelList'])
    .filter((hotel) => firstText(hotel, ['HotelId']))
    .filter((hotel) => {
      const status = safeString(hotel.HotelStatus);
      return !status || status === '0';
    })
    .filter((hotel) => {
      if (!keyword) return true;
      const text = `${hotel.HotelName || ''} ${hotel.HotelNameEn || ''}`.toLowerCase();
      return text.includes(keyword);
    });

  const selectedHotels = hotels.slice(0, MAX_DETAIL_HOTELS);
  const detailResults = [];
  for (const hotel of selectedHotels) {
    try {
      const result = await detailForHotel(config, hotel, {
        check_in_date: event.check_in_date,
        check_out_date: event.check_out_date,
        rooms,
        adults_per_room: adultsPerRoom,
      });
      if (result.ok) detailResults.push(result.hotel);
    } catch (error) {
      detailResults.push(compactObject({
        hotel_id: hotel.HotelId,
        name: hotel.HotelName,
        name_en: hotel.HotelNameEn,
        source: 'elong',
        unavailable_reason: error.message || 'detail_failed',
      }));
    }
  }

  const fallbackResults = detailResults.length ? detailResults : selectedHotels.map((hotel) => compactObject({
    hotel_id: hotel.HotelId,
    name: hotel.HotelName,
    name_en: hotel.HotelNameEn,
    source: 'elong',
  }));

  return {
    success: true,
    code: 0,
    city: {
      key: city.key,
      city_id: city.city_id,
      name: city.display_name,
      name_zh: city.display_name_zh,
    },
    search: {
      check_in_date: event.check_in_date,
      check_out_date: event.check_out_date,
      rooms,
      guests,
      adults_per_room: adultsPerRoom,
      keyword,
    },
    total_static_count: Number(listResult.Count || 0),
    matched_static_count: hotels.length,
    results: fallbackResults,
  };
};
