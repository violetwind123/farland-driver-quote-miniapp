function safeString(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeLabel(value) {
  return safeString(value)
    .replace(/H特惠/gi, '')
    .replace(/\bPrepay\b/gi, '预付')
    .replace(/\bNSMK\b/gi, '无烟')
    .replace(/\bNONSMOKING\b/gi, '无烟')
    .replace(/\bFarland confirmed booking\b/gi, 'Farland 实订过')
    .replace(/\bFarland itinerary-matched\b/gi, '行程已匹配')
    .replace(/\bFarland-recommended\b/gi, 'Farland 推荐')
    .replace(/\bOfficial-listed\b/gi, '学校官方清单')
    .replace(/[,\uFF0C]\s*/g, ' · ')
    .replace(/\s*·\s*/g, ' · ')
    .replace(/(?:^| · )无早(?= · |$)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(?: · ){2,}/g, ' · ')
    .replace(/^ · | · $/g, '')
    .trim();
}

function splitParts(value) {
  return normalizeLabel(value)
    .split(/\s*·\s*|[,，|/]+/)
    .map((item) => normalizeLabel(item))
    .filter(Boolean);
}

function unique(values) {
  const seen = {};
  return values.filter((value) => {
    const key = safeString(value);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function normalizeRoomName(value) {
  const parts = splitParts(value).filter((part) => {
    if (/^无早$/i.test(part)) return false;
    if (/^预付$/i.test(part)) return false;
    if (/^无烟$/i.test(part)) return false;
    if (/^H特惠$/i.test(part)) return false;
    return true;
  });
  return parts.slice(0, 2).join(' · ') || '可订房型';
}

function normalizeRoomChips(room = {}) {
  const values = [
    room.bed,
    room.breakfast,
    room.payment_type,
    room.rate_plan_name,
    room.name,
  ].flatMap(splitParts);
  return unique(values.map((item) => {
    if (/^无早$/i.test(item)) return '无早';
    return item;
  }).filter((item) => {
    if (!item) return false;
    if (/H特惠/i.test(item)) return false;
    if (item === normalizeRoomName(room.name || room.displayName || '')) return false;
    return ['无烟', '预付', '无早'].includes(item) || /床|早|breakfast/i.test(item);
  })).slice(0, 4);
}

function normalizeBadge(value) {
  const label = normalizeLabel(value);
  if (!label || /H特惠|0星/i.test(label)) return '';
  if (['Farland 实订过', '行程已匹配', 'Farland 推荐', '学校官方清单'].includes(label)) return label;
  return label;
}

function normalizeBadges(values = []) {
  const result = [];
  values.forEach((value) => {
    const label = normalizeBadge(value);
    if (label && !result.includes(label)) result.push(label);
  });
  return result.slice(0, 2);
}

function shouldShowStar(value) {
  const text = safeString(value);
  if (!text) return false;
  const numeric = Number(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) && numeric > 0;
}

function formatMoneyText(value, currency) {
  const text = safeString(value);
  if (!text) return '';
  const match = text.match(/([A-Z]{3}|RMB|CNY|USD)?\s*([0-9][0-9,]*(?:\.\d+)?)/i);
  if (!match) return normalizeLabel(text);
  const code = safeString(currency || match[1] || '').toUpperCase();
  const amount = Number(match[2].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const rounded = Math.round(amount);
  return `${code || 'RMB'} ${rounded.toLocaleString('en-US')}`;
}

function formatPriceParts(value, currency) {
  const text = formatMoneyText(value, currency);
  const match = text.match(/^([A-Z]{3}|RMB|CNY|USD)?\s*(.+)$/);
  return {
    currency: match ? (match[1] || 'RMB') : 'RMB',
    amount: match ? match[2] : safeString(value),
    text,
  };
}

function compactCancelText(value) {
  const text = normalizeLabel(value).replace(/\s+/g, ' ');
  if (!text) return '';
  if (/不可取消|non.?refundable|non.?cancel/i.test(text)) return '不可取消';
  if (/免费取消|free cancellation/i.test(text)) return '可免费取消';
  return text.length > 24 ? `${text.slice(0, 24)}...` : text;
}

function cleanAddressPart(value) {
  return safeString(value)
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^,\s*|,\s*$/g, '')
    .trim();
}

function buildFullAddress(hotel = {}) {
  const base = cleanAddressPart(hotel.full_address || hotel.displayAddress || hotel.address || hotel.hotel_address || '');
  const city = cleanAddressPart(hotel.hotel_city || hotel.city || hotel.city_name || '');
  const state = cleanAddressPart(hotel.hotel_state || hotel.state || hotel.state_code || hotel.province || '');
  const postal = cleanAddressPart(hotel.postal_code || hotel.zip || hotel.zip_code || hotel.postal || '');
  const country = cleanAddressPart(hotel.country || hotel.country_name || '');
  const parts = [];
  const normalizedBase = base.toLowerCase();

  if (base) parts.push(base);
  if (city && !normalizedBase.includes(city.toLowerCase())) parts.push(city);
  if (state && !normalizedBase.includes(state.toLowerCase())) parts.push(state);
  if (postal && !normalizedBase.includes(postal.toLowerCase())) parts.push(postal);
  if (country && !/^(us|usa|united states|美国)$/i.test(country) && !normalizedBase.includes(country.toLowerCase())) {
    parts.push(country);
  }

  return unique(parts).join(', ');
}

function formatDistanceLabel(value) {
  const text = normalizeLabel(value);
  if (!text) return '';
  if (/距学校|校内|校园|步行/i.test(text)) return text;
  if (/on campus/i.test(text)) return '校内 / 步行可达';
  return `距学校 ${text}`;
}

function formatDriveTimeLabel(value) {
  const text = normalizeLabel(value);
  if (!text) return '';
  if (/车程|步行|分钟|小时/.test(text)) return text;
  return `车程 ${text}`;
}

function formatTrafficLabel(note, level) {
  const text = normalizeLabel(note);
  const risk = safeString(level).toLowerCase();
  if (/无需早高峰驾车|可步行/.test(text)) return '无需早高峰驾车';
  if (/早高峰基本无延误/.test(text)) return '早高峰基本无延误';
  const delayMatch = text.match(/早\s*8-9\s*点高峰约\s*\+\s*\d+\s*分钟/);
  if (delayMatch) return delayMatch[0].replace(/\s+/g, '');
  if (/heavy|high|拥堵|严重/i.test(risk) || /拥堵|严重/.test(text)) return '早高峰拥堵';
  if (/moderate|medium/i.test(risk) || /建议预留|高峰约/.test(text)) return '早高峰需预留缓冲';
  if (/low/i.test(risk)) return '早高峰低风险';
  return '';
}

function compactTrafficNote(value) {
  const text = normalizeLabel(value);
  if (!text) return '';
  return text.length > 62 ? `${text.slice(0, 62)}...` : text;
}

function buildHotelTransport(hotel = {}) {
  const distanceLabel = formatDistanceLabel(hotel.distance || hotel.distance_text || hotel.school_distance);
  const driveLabel = formatDriveTimeLabel(hotel.drive_time || hotel.drive_time_text || hotel.duration_text);
  const trafficNote = hotel.transit_note || hotel.traffic_text || hotel.peak_traffic_note || hotel.rush_hour_note;
  const trafficLabel = formatTrafficLabel(trafficNote, hotel.transit_risk_level || hotel.traffic_level);
  const items = [];
  if (distanceLabel) items.push({ key: 'distance', label: distanceLabel, className: 'distance' });
  if (driveLabel) items.push({ key: 'drive', label: driveLabel, className: 'drive' });
  if (trafficLabel) {
    const risk = safeString(hotel.transit_risk_level || hotel.traffic_level).toLowerCase();
    const className = /moderate|medium/.test(risk) ? 'traffic moderate' : (/heavy|high/.test(risk) ? 'traffic high' : 'traffic low');
    items.push({ key: 'traffic', label: trafficLabel, className });
  }
  return {
    items,
    note: compactTrafficNote(trafficNote),
    hasTransport: items.length > 0 || Boolean(trafficNote),
  };
}

function resolveHotelImage(hotel = {}, index = 0) {
  const images = [
    hotel.image_url,
    hotel.image,
    hotel.photo_url,
    hotel.thumbnail,
    hotel.cover,
  ].filter(Boolean);
  if (images[0]) return images[0];
  const fallbacks = [
    '/assets/images/hotel-lobby-01.jpg',
    '/assets/images/hotel-member-bg.jpg',
    '/assets/images/hotel-soft-bg.jpg',
  ];
  return fallbacks[index % fallbacks.length];
}

module.exports = {
  safeString,
  normalizeLabel,
  normalizeRoomName,
  normalizeRoomChips,
  normalizeBadges,
  shouldShowStar,
  formatMoneyText,
  formatPriceParts,
  compactCancelText,
  buildFullAddress,
  buildHotelTransport,
  resolveHotelImage,
};
