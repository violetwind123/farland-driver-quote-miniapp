// 5a/5b 运营访校预约列表页
// 绑定既有 Wave-1 云函数 listOperatorVisitBookings(不新建 getOperatorVisitBookings)。
// PII/091:本页仅是运营端只读展示,this.data 只持有 ops 白名单派生字段;
// 绝不缓存云函数返回的原始 doc(其含 visitOffice/contactPerson/advisorNotes/materials 明细/
// requestedSlots/timeline 等黑名单)。chipClass/dotColor 只由本地 STATE_MAP 派生,
// 不消费任何服务端下发的颜色。无任何 091 内容键化 / trip091 引用。

// 8 态映射,镜像 theme.wxss:157-200 注释。
// 注意:cancelled 用 class 'neutral'(灰),不用 theme 的 .status-chip.cancelled(danger-bg 着色)——设计 §2 line40「灰」,刻意为之。
var STATE_MAP = {
  pending_query:    { class: 'neutral',         text: '待查询',     dot: '#9096A8' },
  available:        { class: 'success-soft',    text: '可预约',     dot: '#3F7A5D' },
  submitted:        { class: 'pending',         text: '已提交',     dot: '#57639E' },
  awaiting_school:  { class: 'warn-soft',       text: '学校待确认', dot: '#C08243' },
  confirmed:        { class: 'confirmed-solid', text: '已确认',     dot: '#3F7A5D' },
  materials_needed: { class: 'warn-soft',       text: '需补材料',   dot: '#C08243' },
  conflict:         { class: 'danger-soft',     text: '时间冲突',   dot: '#B4463C' },
  cancelled:        { class: 'neutral',         text: '已取消',     dot: '#C4C8D4' },
};
var FALLBACK_STATE = { class: 'neutral', text: '待查询', dot: '#9096A8' };

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}
function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
function pickState(status) {
  var key = safeString(status).trim();
  return STATE_MAP[key] || FALLBACK_STATE;
}

// 本周判定:confirmedSlot.date 落在含今日的周(周一~周日)内。
function weekBounds(now) {
  var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var dow = d.getDay(); // 0=周日
  var offsetToMonday = dow === 0 ? -6 : 1 - dow;
  var monday = new Date(d);
  monday.setDate(d.getDate() + offsetToMonday);
  var sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  function ymd(x) {
    var m = x.getMonth() + 1;
    var day = x.getDate();
    return x.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  return { start: ymd(monday), end: ymd(sunday) };
}

// 从 YYYY-MM-DD 生成中文日期标签,失败回退原串或「未排期」。
function dateLabel(dateStr) {
  var raw = safeString(dateStr).trim();
  if (!raw || raw === '未排期') return '未排期';
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  var weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var wd = Number.isNaN(dt.getTime()) ? '' : ' · ' + weekNames[dt.getDay()];
  return Number(m[2]) + '月' + Number(m[3]) + '日' + wd;
}

// 单条 booking(服务端原始 doc)-> ops 白名单行视图模型。
// 只读取白名单字段;绝不携带 visitOffice/contactPerson/advisorNotes/materials 明细/requestedSlots/timeline。
function toRowVM(booking) {
  var derived = isPlainObject(booking._derived) ? booking._derived : {};
  var school = isPlainObject(booking.school) ? booking.school : {};
  var slot = isPlainObject(booking.confirmedSlot) ? booking.confirmedSlot : {};
  var students = Array.isArray(booking.students) ? booking.students : [];
  var status = safeString(booking.status).trim();
  var cancelled = status === 'cancelled';
  var conflict = Boolean(derived.hasConflict);

  // chipClass/dot 只由本地 STATE_MAP 派生(不消费服务端颜色)。
  var state = pickState(status);

  var schoolCn = safeString(school.nameCn) || safeString(school.nameEn) || '未命名学校';
  var schoolEn = safeString(school.nameEn);
  var city = safeString(school.city);
  var campus = safeString(school.campus);

  var start = safeString(slot.start).trim();
  var end = safeString(slot.end).trim();
  var timeRange = start && end ? (start + ' – ' + end) : (start || '待定');

  var first = isPlainObject(students[0]) ? students[0] : {};
  var studentName = safeString(first.name);
  var studentGrade = safeString(first.grade);
  var studentLabel = studentName
    ? (studentName + (studentGrade ? ' · ' + studentGrade : ''))
    : '';

  // 材料只作计数(materialsCount 来自服务端 _derived),绝不渲染 materials 明细。
  var mc = isPlainObject(derived.materialsCount) ? derived.materialsCount : {};
  var total = Number(mc.total) || 0;
  var done = (Number(mc.submitted) || 0) + (Number(mc.verified) || 0);
  var materialsLabel = total ? ('材料 ' + done + '/' + total) : '';
  var needMaterials = status === 'materials_needed' || (total > 0 && done < total);

  var meetingPoint = isPlainObject(booking.meetingPoint) ? booking.meetingPoint : {};
  var meetingPointLabel = safeString(meetingPoint.name);

  var visitTypeLabel = safeString(booking.visitType);

  var arrival = isPlainObject(booking.arrival) ? booking.arrival : {};
  var arriveEarlyMin = Number(arrival.arriveEarlyMin) || 0;
  var transportNote = safeString(arrival.transportNote);

  var weather = isPlainObject(booking.weather) ? booking.weather : null;
  var weatherLabel = '';
  if (weather) {
    var hi = safeString(weather.high);
    var lo = safeString(weather.low);
    if (hi || lo) weatherLabel = (hi || '--') + '/' + (lo || '--') + '°C';
  }

  var subParts = [];
  if (city) subParts.push(city);
  if (timeRange && timeRange !== '待定') subParts.push(timeRange);
  if (visitTypeLabel) subParts.push(visitTypeLabel);

  return {
    id: safeString(booking._id).trim() || safeString(booking.external_visit_id).trim(),
    conflictWith: safeString(derived.conflictWith).trim() || null,
    status: status,
    cancelled: cancelled,
    conflict: conflict,
    chipClass: state.class,
    statusText: state.text,
    dotColor: state.dot,
    schoolCn: schoolCn,
    schoolEn: schoolEn,
    city: city,
    campus: campus,
    subline: subParts.join(' · ') || '待排期',
    timeRange: timeRange,
    visitTypeLabel: visitTypeLabel,
    meetingPointLabel: meetingPointLabel,
    studentLabel: studentLabel,
    materialsLabel: materialsLabel,
    needMaterials: needMaterials,
    weatherLabel: weatherLabel,
    arriveEarlyMin: arriveEarlyMin,
    transportNote: transportNote,
    conflictNote: conflict ? '时间冲突' : '',
  };
}

// §4 折叠规则:同日非取消 ≥3 -> collapsedMode(全折叠成 96rpx 行);
// 冲突对强制相邻并包进 conflict-wrap(单条 reason);取消行置组尾、opacity .55。
function buildItems(rows, collapsedMode, allExpanded) {
  // 服务端已按「取消置尾 + startKey」排序;此处保持顺序,仅做冲突对相邻聚合。
  var byId = {};
  rows.forEach(function (r) { if (r.id) byId[r.id] = r; });

  var items = [];
  var consumed = {};

  rows.forEach(function (row) {
    if (consumed[row.id]) return;
    // 冲突对:row.conflict 且有 conflictWith 且对方在本组内 -> 包成一个 conflict item。
    if (row.conflict && row.conflictWith && byId[row.conflictWith] && !consumed[row.conflictWith]
        && !row.cancelled) {
      var partner = byId[row.conflictWith];
      consumed[row.id] = true;
      consumed[row.conflictWith] = true;
      items.push({
        type: 'conflict',
        key: 'conflict-' + row.id + '-' + partner.id,
        studentName: row.studentLabel || partner.studentLabel || '',
        rows: [row, partner],
      });
      return;
    }
    consumed[row.id] = true;
    // 展开态:非折叠模式,或该组已「全部展开」,且非取消行 -> 卡片;否则折叠行。
    var expand = (!collapsedMode || allExpanded) && !row.cancelled;
    items.push({
      type: expand ? 'card' : 'row',
      key: (expand ? 'card-' : 'row-') + row.id,
      row: row,
      card: row,
    });
  });

  return items;
}

function buildDayGroups(serverGroups, expandedDates) {
  var groups = Array.isArray(serverGroups) ? serverGroups : [];
  var out = [];
  groups.forEach(function (g) {
    var date = safeString(g.date).trim() || '未排期';
    var rawItems = Array.isArray(g.items) ? g.items : [];
    var rows = rawItems.map(toRowVM);
    var nonCancelled = rows.filter(function (r) { return !r.cancelled; }).length;
    var collapsedMode = nonCancelled >= 3;
    var allExpanded = Boolean(expandedDates[date]);
    var hasConflict = rows.some(function (r) { return r.conflict; });
    out.push({
      date: date,
      dateLabel: dateLabel(date),
      count: rows.length,
      hasConflict: hasConflict,
      collapsedMode: collapsedMode,
      allExpanded: allExpanded,
      items: buildItems(rows, collapsedMode, allExpanded),
    });
  });
  return out;
}

// 头部统计(本周/待确认/冲突)由完整返回集派生。
// listOperatorVisitBookings 一次性返回全量(上限 300,非分页),故此处派生不产生分页漂移。
function buildHeader(serverGroups, meta, now) {
  var groups = Array.isArray(serverGroups) ? serverGroups : [];
  var wb = weekBounds(now);
  var weekCount = 0;
  var pendingCount = 0;
  var conflictIds = {};
  var cities = {};

  groups.forEach(function (g) {
    var date = safeString(g.date).trim();
    var inWeek = date && date >= wb.start && date <= wb.end;
    var rawItems = Array.isArray(g.items) ? g.items : [];
    rawItems.forEach(function (b) {
      var status = safeString(b.status).trim();
      if (status === 'cancelled') return;
      if (inWeek) weekCount += 1;
      // 待确认:已提交 / 学校待确认。
      if (status === 'submitted' || status === 'awaiting_school') pendingCount += 1;
      var derived = isPlainObject(b._derived) ? b._derived : {};
      if (derived.hasConflict) {
        var id = safeString(b._id).trim();
        if (id) conflictIds[id] = true;
      }
      var school = isPlainObject(b.school) ? b.school : {};
      var city = safeString(school.city).trim();
      if (city) cities[city] = true;
    });
  });

  var cityList = Object.keys(cities);
  var routeLabel = cityList.length
    ? (cityList.length <= 3 ? cityList.join(' / ') : (cityList.slice(0, 3).join(' / ') + ' 等' + cityList.length + '城'))
    : '暂无排期';

  return {
    customerLabel: '全部客户',
    routeLabel: routeLabel,
    weekCount: weekCount,
    pendingCount: pendingCount,
    conflictCount: Object.keys(conflictIds).length,
  };
}

Page({
  data: {
    loading: true,
    header: { customerLabel: '', routeLabel: '', weekCount: 0, pendingCount: 0, conflictCount: 0 },
    filters: [
      { key: 'status', label: '状态 · 全部', active: true },
      { key: 'city', label: '城市', active: false },
      { key: 'date', label: '日期', active: false },
      { key: 'student', label: '学生', active: false },
      { key: 'school', label: '学校', active: false },
    ],
    dayGroups: [],
    dataSyncTime: '',
    activeFilters: {},
    // 页面态:各日期是否「全部展开」。
    _expandedDates: {},
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load(function () { wx.stopPullDownRefresh(); });
  },

  load(done) {
    var self = this;
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'listOperatorVisitBookings',
      data: { filters: this.data.activeFilters },
    }).then(function (res) {
      var result = res && res.result ? res.result : {};
      if (!result.success) {
        self.setData({ loading: false, dayGroups: [] });
        wx.showToast({ title: result.message || '加载失败', icon: 'none' });
        if (typeof done === 'function') done();
        return;
      }
      var serverGroups = Array.isArray(result.dayGroups) ? result.dayGroups : [];
      var meta = isPlainObject(result.meta) ? result.meta : {};
      var now = new Date();
      self.setData({
        loading: false,
        header: buildHeader(serverGroups, meta, now),
        dayGroups: buildDayGroups(serverGroups, self.data._expandedDates),
        dataSyncTime: safeString(meta.dataSyncTime),
      });
      // 缓存原始分组,供 toggleDayExpand 重建(仅用于本次会话的展开切换,不长期持有)。
      self._serverGroups = serverGroups;
      if (typeof done === 'function') done();
    }).catch(function (error) {
      self.setData({ loading: false, dayGroups: [] });
      wx.showToast({ title: '网络异常,请重试', icon: 'none' });
      if (typeof done === 'function') done();
    });
  },

  onFilterTap(e) {
    // R5 显示为主:切换 active 高亮(FilterSheet 为后续单元)。status 为默认项,点击其它项做占位切换。
    var key = e.currentTarget.dataset.key;
    var filters = this.data.filters.map(function (f) {
      return { key: f.key, label: f.label, active: f.key === key };
    });
    this.setData({ filters: filters });
  },

  toggleDayExpand(e) {
    var date = e.currentTarget.dataset.date;
    if (!date) return;
    var expanded = Object.assign({}, this.data._expandedDates);
    expanded[date] = !expanded[date];
    this.setData({
      _expandedDates: expanded,
      dayGroups: buildDayGroups(this._serverGroups || [], expanded),
    });
  },

  onRowTap(e) {
    // R5 只读:5c 详情页尚未注册,失败即软回退(不报错、不中断)。
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/operator/visit-booking-detail/visit-booking-detail?visit_id=' + id,
      fail: function () {
        wx.showToast({ title: '详情页开发中', icon: 'none' });
      },
    });
  },

  onAdvisorFallback() {
    wx.showToast({ title: '顾问代查:请联系运营录入', icon: 'none' });
  },
});
