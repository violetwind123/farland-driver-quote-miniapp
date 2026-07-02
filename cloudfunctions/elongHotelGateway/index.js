const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');
const zlib = require('zlib');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const LOG_COLLECTION = 'elong_hotel_api_logs';
const DEFAULT_VERSION = '1.62';
const DEFAULT_LOCAL = 'zh_CN';

class InputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InputError';
    this.code = code;
  }
}

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function firstDefined(source, keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function firstText(source, keys, fallback = '') {
  const value = firstDefined(source, keys);
  const text = safeString(value).trim();
  return text || fallback;
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

function asBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = safeString(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(text)) return true;
  if (['0', 'false', 'no', 'n'].includes(text)) return false;
  return fallback;
}

function compactObject(input) {
  return Object.keys(input).reduce((acc, key) => {
    const value = input[key];
    if (value === undefined || value === null || value === '') return acc;
    acc[key] = value;
    return acc;
  }, {});
}

function parseChildAges(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const source = Array.isArray(value) ? value : safeString(value).split(',');
  return source
    .map((item) => Number(item))
    .filter((age) => Number.isFinite(age) && age >= 0 && age <= 17)
    .map((age) => Math.floor(age));
}

function requestInput(event) {
  return event.Request || event.request || event.params || event;
}

function requireText(input, keys, code, message) {
  const value = firstText(input, keys);
  if (!value) throw new InputError(code, message);
  return value;
}

function normalizeAction(value) {
  const text = safeString(value).trim();
  const aliases = {
    static_list: 'staticList',
    'static-list': 'staticList',
    static_info: 'staticInfo',
    'static-info': 'staticInfo',
    hotel_detail: 'detail',
    'hotel-detail': 'detail',
    data_validate: 'validate',
    'data-validate': 'validate',
  };
  return aliases[text] || text;
}

function buildCityRequest(event) {
  const input = requestInput(event);
  return compactObject({
    CountryType: asPositiveInt(firstDefined(input, ['CountryType', 'country_type']), 2),
    CityIdType: firstDefined(input, ['CityIdType', 'city_id_type']),
    IsNeedLocation: asBoolean(firstDefined(input, ['IsNeedLocation', 'is_need_location']), false),
    PageSize: asPositiveInt(firstDefined(input, ['PageSize', 'page_size']), 200, 200),
    PageIndex: asPositiveInt(firstDefined(input, ['PageIndex', 'page_index']), 1),
  });
}

function buildStaticListRequest(event) {
  const input = requestInput(event);
  return compactObject({
    StartTime: firstText(input, ['StartTime', 'start_time']),
    EndTime: firstText(input, ['EndTime', 'end_time']),
    CityId: requireText(input, ['CityId', 'city_id'], 'CITY_ID_REQUIRED', '请提供供应商 CityId'),
    PageSize: asPositiveInt(firstDefined(input, ['PageSize', 'page_size']), 2000, 2000),
    PageIndex: asPositiveInt(firstDefined(input, ['PageIndex', 'page_index']), 1),
  });
}

function buildStaticInfoRequest(event) {
  const input = requestInput(event);
  return compactObject({
    HotelId: requireText(input, ['HotelId', 'hotel_id'], 'HOTEL_ID_REQUIRED', '请提供供应商 HotelId'),
    Options: firstText(input, ['Options', 'options'], '1,2,3,4,5'),
  });
}

function buildDetailRequest(event) {
  const input = requestInput(event);
  const rooms = asPositiveInt(firstDefined(input, ['NumberOfRooms', 'number_of_rooms', 'rooms']), 1, 7);
  const childAges = parseChildAges(firstDefined(input, ['ChildAges', 'child_ages']));
  return compactObject({
    ArrivalDate: requireText(input, ['ArrivalDate', 'arrival_date', 'check_in_date'], 'ARRIVAL_DATE_REQUIRED', '请提供入住日期'),
    DepartureDate: requireText(input, ['DepartureDate', 'departure_date', 'check_out_date'], 'DEPARTURE_DATE_REQUIRED', '请提供离店日期'),
    LatestArrivalTime: firstText(input, ['LatestArrivalTime', 'latest_arrival_time']),
    PaymentType: firstText(input, ['PaymentType', 'payment_type'], 'All'),
    InvoiceMode: firstText(input, ['InvoiceMode', 'invoice_mode']),
    HotelIds: requireText(input, ['HotelIds', 'HotelId', 'hotel_ids', 'hotel_id'], 'HOTEL_ID_REQUIRED', '请提供供应商 HotelId'),
    RoomTypeId: firstText(input, ['RoomTypeId', 'RoomTypeID', 'room_type_id']),
    RatePlanId: firstDefined(input, ['RatePlanId', 'rate_plan_id']),
    NumberOfAdults: asPositiveInt(firstDefined(input, ['NumberOfAdults', 'number_of_adults', 'adults', 'guests']), 2),
    ChildAges: childAges,
    NumberOfRooms: rooms,
    SaveMajiaId: asBoolean(firstDefined(input, ['SaveMajiaId', 'save_majia_id']), true),
    Options: firstText(input, ['Options', 'options'], rooms > 1 ? '1,2,4,12,13' : '1,2,4,12'),
  });
}

function buildValidateRequest(event) {
  const input = requestInput(event);
  if (!input || input === event) {
    throw new InputError('REQUEST_REQUIRED', '试单请把供应商 Request 放在 request 字段中，避免漏传国际特有字段');
  }
  const childAges = parseChildAges(firstDefined(input, ['ChildAges', 'child_ages']));
  return compactObject({
    ArrivalDate: requireText(input, ['ArrivalDate', 'arrival_date', 'check_in_date'], 'ARRIVAL_DATE_REQUIRED', '请提供入住日期'),
    DepartureDate: requireText(input, ['DepartureDate', 'departure_date', 'check_out_date'], 'DEPARTURE_DATE_REQUIRED', '请提供离店日期'),
    EarliestArrivalTime: requireText(input, ['EarliestArrivalTime', 'earliest_arrival_time'], 'EARLIEST_ARRIVAL_REQUIRED', '请提供最早到店时间'),
    LatestArrivalTime: requireText(input, ['LatestArrivalTime', 'latest_arrival_time'], 'LATEST_ARRIVAL_REQUIRED', '请提供最晚到店时间'),
    HotelId: requireText(input, ['HotelId', 'hotel_id'], 'HOTEL_ID_REQUIRED', '请提供供应商 HotelId'),
    RoomId: firstText(input, ['RoomId', 'room_id']),
    RoomTypeID: requireText(input, ['RoomTypeID', 'RoomTypeId', 'room_type_id'], 'ROOM_TYPE_ID_REQUIRED', '请提供 RoomTypeID'),
    RatePlanId: requireText(input, ['RatePlanId', 'rate_plan_id'], 'RATE_PLAN_ID_REQUIRED', '请提供 RatePlanId'),
    TotalPrice: requireText(input, ['TotalPrice', 'total_price'], 'TOTAL_PRICE_REQUIRED', '请提供 TotalPrice'),
    NumberOfRooms: asPositiveInt(firstDefined(input, ['NumberOfRooms', 'number_of_rooms', 'rooms']), 1, 7),
    LittleMajiaId: requireText(input, ['LittleMajiaId', 'little_majia_id'], 'LITTLE_MAJIA_ID_REQUIRED', '请回传 hotel.detail 返回的 LittleMajiaId'),
    GoodsUniqId: requireText(input, ['GoodsUniqId', 'goods_uniq_id'], 'GOODS_UNIQ_ID_REQUIRED', '请回传 hotel.detail 返回的 GoodsUniqId'),
    ChildAges: childAges,
    NumberOfAdults: asPositiveInt(requireText(input, ['NumberOfAdults', 'number_of_adults', 'adults'], 'NUMBER_OF_ADULTS_REQUIRED', '请回传与 hotel.detail 一致的成人数'), 2),
    HotelCode: requireText(input, ['HotelCode', 'hotel_code'], 'HOTEL_CODE_REQUIRED', '请回传国际酒店 HotelCode'),
    SupplierId: requireText(input, ['SupplierId', 'supplier_id'], 'SUPPLIER_ID_REQUIRED', '请回传国际酒店 SupplierId'),
    SubSupplierId: requireText(input, ['SubSupplierId', 'sub_supplier_id'], 'SUB_SUPPLIER_ID_REQUIRED', '请回传国际酒店 SubSupplierId'),
    ShopperProductId: requireText(input, ['ShopperProductId', 'shopper_product_id'], 'SHOPPER_PRODUCT_ID_REQUIRED', '请回传国际酒店 ShopperProductId'),
    CurrencyCode: requireText(input, ['CurrencyCode', 'currency_code'], 'CURRENCY_CODE_REQUIRED', '请回传 CurrencyCode'),
    Nat: firstDefined(input, ['Nat', 'nat']),
    DayPriceList: firstDefined(input, ['DayPriceList', 'day_price_list']),
  });
}

const ACTIONS = {
  city: { method: 'hotel.static.city', buildRequest: buildCityRequest },
  staticList: { method: 'hotel.static.list', buildRequest: buildStaticListRequest },
  staticInfo: { method: 'hotel.static.info', buildRequest: buildStaticInfoRequest },
  detail: { method: 'hotel.detail', buildRequest: buildDetailRequest },
  validate: { method: 'hotel.data.validate', buildRequest: buildValidateRequest },
};

async function requireRole(roles) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, code: 401, message: '无法识别用户身份' };
  const res = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = res.data && res.data[0];
  if (!user || user.status !== 'active' || !roles.includes(user.role)) {
    return { ok: false, code: 403, message: '无权限访问' };
  }
  return { ok: true, openid: OPENID, user };
}

function getConfig(event) {
  const envName = safeString(process.env.ELONG_HOTEL_ENV || 'test').trim().toLowerCase();
  const production = ['prod', 'production'].includes(envName);
  const config = {
    envName: production ? 'prod' : 'test',
    host: production ? 'api.elong.com' : 'api-test.elong.com',
    user: safeString(process.env.ELONG_HOTEL_USER).trim(),
    appKey: safeString(process.env.ELONG_HOTEL_APP_KEY).trim(),
    secretKey: safeString(process.env.ELONG_HOTEL_SECRET_KEY).trim(),
    version: firstText(event, ['Version', 'version'], process.env.ELONG_HOTEL_VERSION || DEFAULT_VERSION),
    local: firstText(event, ['Local', 'local'], process.env.ELONG_HOTEL_LOCAL || DEFAULT_LOCAL),
    timeoutMs: asPositiveInt(process.env.ELONG_HOTEL_TIMEOUT_MS, 25000, 60000),
  };
  const missing = [];
  if (!config.user) missing.push('ELONG_HOTEL_USER');
  if (!config.appKey) missing.push('ELONG_HOTEL_APP_KEY');
  if (!config.secretKey) missing.push('ELONG_HOTEL_SECRET_KEY');
  return { config, missing };
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

function callElong({ config, method, request }) {
  return new Promise((resolve, reject) => {
    const dataText = JSON.stringify({
      Version: config.version,
      Local: config.local,
      Request: request,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = md5(`${timestamp}${md5(`${dataText}${config.appKey}`)}${config.secretKey}`);
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
      timeout: config.timeoutMs,
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'br,gzip',
        Connection: 'keep-alive',
        'User-Agent': 'FarlandMiniapp-ElongHotelGateway/1.0',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', async () => {
        try {
          const decoded = await decodeResponse(Buffer.concat(chunks), res.headers['content-encoding']);
          const bodyText = decoded.toString('utf8');
          const body = bodyText ? JSON.parse(bodyText) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body,
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('ELONG_REQUEST_TIMEOUT'));
    });
    req.on('error', reject);
    req.end();
  });
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Collection already exists or the caller lacks create permission.
  }
}

async function writeLog({ auth, action, method, request, response, errorCode }) {
  await ensureCollection(LOG_COLLECTION);
  await db.collection(LOG_COLLECTION).add({
    data: {
      action,
      method,
      request_summary: {
        hotel_id: request.HotelId || request.HotelIds || '',
        city_id: request.CityId || '',
        arrival_date: request.ArrivalDate || '',
        departure_date: request.DepartureDate || '',
        number_of_rooms: request.NumberOfRooms || '',
        number_of_adults: request.NumberOfAdults || '',
      },
      elong_code: response && response.body ? response.body.Code : '',
      elong_guid: response && response.body ? response.body.Guid : '',
      http_status: response ? response.statusCode : '',
      error_code: errorCode || '',
      actor_openid: auth.openid,
      actor_user_id: auth.user && auth.user._id,
      created_at: new Date().toISOString(),
    },
  }).catch(() => null);
}

exports.main = async (event = {}) => {
  const auth = await requireRole(['operator', 'super_admin']);
  if (!auth.ok) {
    return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
  }

  const action = normalizeAction(firstText(event, ['action', 'type'], 'detail'));
  const actionConfig = ACTIONS[action];
  if (!actionConfig) {
    return {
      success: false,
      code: 422,
      error_code: 'UNSUPPORTED_ACTION',
      message: `暂不支持的酒店供应商动作：${action}`,
      supported_actions: Object.keys(ACTIONS),
    };
  }

  const { config, missing } = getConfig(event);
  if (missing.length) {
    return {
      success: false,
      code: 500,
      error_code: 'ELONG_CONFIG_MISSING',
      message: '酒店供应商接口环境变量未配置完整',
      missing_env: missing,
    };
  }

  let request;
  try {
    request = actionConfig.buildRequest(event);
  } catch (error) {
    if (error instanceof InputError) {
      return { success: false, code: 422, error_code: error.code, message: error.message };
    }
    throw error;
  }

  try {
    const response = await callElong({
      config,
      method: actionConfig.method,
      request,
    });
    const elongCode = safeString(response.body && response.body.Code);
    const ok = response.statusCode >= 200 && response.statusCode < 300 && elongCode === '0';
    await writeLog({
      auth,
      action,
      method: actionConfig.method,
      request,
      response,
      errorCode: ok ? '' : 'ELONG_API_ERROR',
    });
    return {
      success: ok,
      code: ok ? 0 : 502,
      action,
      method: actionConfig.method,
      environment: config.envName,
      elong_code: elongCode,
      guid: (response.body && response.body.Guid) || '',
      result: response.body ? response.body.Result : null,
      error_message: response.body ? (response.body.ErrorMessage || response.body.Message || '') : '',
      request_echo: event.debug_request ? {
        Version: config.version,
        Local: config.local,
        Request: request,
      } : undefined,
      elong_response: event.include_raw ? response.body : undefined,
    };
  } catch (error) {
    await writeLog({
      auth,
      action,
      method: actionConfig.method,
      request,
      response: null,
      errorCode: error.message || 'ELONG_GATEWAY_ERROR',
    });
    return {
      success: false,
      code: 502,
      error_code: 'ELONG_GATEWAY_ERROR',
      message: '酒店供应商接口调用失败',
      detail: error.message || safeString(error),
    };
  }
};
