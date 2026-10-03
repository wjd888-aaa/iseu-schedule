const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = 'rsp.iseu.by';
const BASE = '/Raspisanie/TimeTable/Magistranty.aspx';
const REQUEST_TIMEOUT_MS = 60000;
const TOTAL_TIMEOUT_MS = 300000;
const NOTIFY_FILE = path.join(__dirname, '..', 'notification.txt');

const PAGE_URL = 'https://wjd888-aaa.github.io/iseu-schedule/';
const WEEKDAYS_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

const CONFIG = {
  faculty: '4',
  department: '2',
  course: '1',
  group: 'В51ЭК5',
};

function extract$(html, name) {
  const m = html.match(new RegExp('name="' + name + '"[^>]*value="([^"]*)"'));
  return m ? m[1] : '';
}

function getOptions(html, name) {
  const match = html.match(new RegExp('<select name="' + name + '"[^>]*>([\\s\\S]*?)<\\/select>'));
  if (!match) return [];
  const r = [];
  const re = /<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g;
  let m;
  while ((m = re.exec(match[1])) !== null) r.push({ v: m[1], l: m[2].trim() });
  return r;
}

function enc(o) {
  return Object.entries(o).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v || '')).join('&');
}

function req(method, data) {
  return new Promise((resolve, reject) => {
    const o = {
      hostname: HOST, path: BASE, method,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded' },
    };
    const r = http.request(o, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve(b));
    });
    r.setTimeout(REQUEST_TIMEOUT_MS, () => {
      r.destroy(new Error('站点响应超时（' + REQUEST_TIMEOUT_MS / 1000 + '秒无响应）'));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function postback(html, target, params) {
  return req('POST', enc({
    __EVENTTARGET: target || '', __EVENTARGUMENT: '', __LASTFOCUS: '',
    __VIEWSTATE: extract$(html, '__VIEWSTATE'),
    __VIEWSTATEGENERATOR: extract$(html, '__VIEWSTATEGENERATOR'),
    __EVENTVALIDATION: extract$(html, '__EVENTVALIDATION'),
    ...params,
  }));
}

function weekDate(o) {
  const [d, m, y] = o.v.split(' ')[0].split('.');
  return new Date(+y, +m - 1, +d);
}

function candidateWeeks(html) {
  const now = new Date();
  const all = getOptions(html, 'ddlWeek')
    .map((o) => ({ o, dt: weekDate(o) }))
    .sort((a, b) => a.dt - b.dt);
  const past = all.filter((w) => w.dt <= now);
  const future = all.filter((w) => w.dt > now);
  const current = past.pop() || null;
  return (current ? [current] : []).concat(future, past.reverse());
}

function hasCourses(rows) {
  return buildSchedule(rows).some((d) => d.courses.length > 0);
}

function parseTable(html) {
  const m = html.match(/<table id="TT"[^>]*>([\s\S]*?)<\/table>/);
  if (!m) return [];
  let t = m[1].replace(/<thead[\s\S]*?<\/thead>/gi, '');
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(t)) !== null) {
    const c = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let td;
    while ((td = tdRe.exec(tr[1])) !== null) {
      c.push(td[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    }
    if (c.length) rows.push(c);
  }
  return rows;
}

function buildSchedule(rows) {
  const d = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const days = [];
  let cur = null;
  for (const r of rows) {
    if (r.length < 2) continue;
    const isDay = d.some((x) => r[0].includes(x)) || /\d{2}\.\d{2}\.\d{4}/.test(r[0]);
    if (isDay) {
      cur = { name: r[0], courses: [] };
      days.push(cur);
      const rest = r.slice(1).filter(Boolean);
      if (rest.length) cur.courses.push(rest);
    } else if (cur) {
      const f = r.filter(Boolean);
      if (f.length) cur.courses.push(f);
    }
  }
  return days;
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return h.toString(36);
}

function scheduleHash(schedule) {
  return hash(JSON.stringify(schedule));
}

async function fetchSchedule() {
  let html = await req('GET');
  html = await postback(html, 'ddlFac', { ddlFac: CONFIG.faculty, ddlDep: '', ddlCourse: '', ddlGroup: '', ddlWeek: '' });
  html = await postback(html, 'ddlDep', { ddlFac: CONFIG.faculty, ddlDep: CONFIG.department, ddlCourse: '', ddlGroup: '', ddlWeek: '' });
  html = await postback(html, 'ddlCourse', { ddlFac: CONFIG.faculty, ddlDep: CONFIG.department, ddlCourse: CONFIG.course, ddlGroup: '', ddlWeek: '' });

  const groups = getOptions(html, 'ddlGroup');
  if (!groups.length) throw new Error('No groups');
  const grp = groups.find((g) => g.l === CONFIG.group || g.v === CONFIG.group);
  if (!grp) {
    throw new Error('指定组不存在：' + CONFIG.group + '（可选：' + groups.map((g) => g.l).join('、') + '）');
  }

  const candidates = candidateWeeks(html);
  if (!candidates.length) throw new Error('No week');
  const currentWeekValue = candidates[0].o.v;

  let wk = candidates[0].o;
  let rows = [];
  for (const c of candidates) {
    const res = await postback(html, 'btnShow', {
      ddlFac: CONFIG.faculty, ddlDep: CONFIG.department, ddlCourse: CONFIG.course,
      ddlGroup: grp.v, ddlWeek: c.o.v,
      btnShow: '\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C',
    });
    const parsed = parseTable(res);
    if (hasCourses(parsed)) { wk = c.o; rows = parsed; break; }
  }
  if (!hasCourses(rows)) throw new Error('No schedule data for group ' + grp.l);

  const schedule = buildSchedule(rows);

  const [d, m, y] = wk.l.split('.');
  const dt = new Date(+y, +m - 1, +d);
  const wn = Math.ceil(((dt - new Date(+y, 0, 1)) / 86400000 + new Date(+y, 0, 1).getDay() + 1) / 7);

  const wkDaysRU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const wkDaysEN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wkDaysCN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const clean = schedule.map((day) => {
    const idx = wkDaysRU.findIndex((x) => day.name.includes(x));
    return {
      dayCN: wkDaysCN[idx] || '',
      dayEN: wkDaysEN[idx] || '',
      dayRU: day.name,
      courses: day.courses.map((c) => {
        const [typePart, ...subjectParts] = (c[1] || '').split('. ');
        return {
          time: c[0] || '',
          type: (typePart || '').trim(),
          subject: (subjectParts.join('. ') || '').trim(),
          teacher: (c[2] || '').trim(),
          room: (c[3] || '').trim(),
        };
      }),
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    week: { label: wk.l, number: wn, isCurrent: wk.v === currentWeekValue },
    group: grp.l,
    schedule: clean,
    hash: scheduleHash(clean),
  };
}

function telegramMessage(data) {
  const lines = [
    '📅 ISEU 课表已更新',
    `第 ${data.week.number} 周（${data.week.label}）· ${data.group}`,
    PAGE_URL,
  ];
  const now = new Date().getDay();
  const today = data.schedule.find((d) => WEEKDAYS_RU.findIndex((w) => d.dayRU.includes(w)) === now);
  if (today && today.courses.length) {
    lines.push('');
    lines.push('🗓 今日课程:');
    for (const c of today.courses) lines.push(`  ${c.time}  ${c.subject}`);
  } else {
    const next = data.schedule.find((d) => {
      const i = WEEKDAYS_RU.findIndex((w) => d.dayRU.includes(w));
      return i > now && d.courses.length;
    });
    if (next) {
      lines.push('');
      lines.push(`🗓 下次课程（${next.dayCN}）:`);
      for (const c of next.courses) lines.push(`  ${c.time}  ${c.subject}`);
    }
  }
  return lines.join('\n');
}

function telegramNotify(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return Promise.resolve();
  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true });
    const o = {
      hostname: 'api.telegram.org',
      path: '/bot' + token + '/sendMessage',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const r = https.request(o, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });
    r.setTimeout(15000, () => { r.destroy(new Error('telegram timeout')); });
    r.on('error', () => resolve());
    r.write(body);
    r.end();
  });
}

async function checkAndNotify() {
  let oldHash = '';
  try { const old = JSON.parse(fs.readFileSync('schedule-data.json', 'utf8')); oldHash = old.hash || ''; } catch (_) {}
  try {
    const data = await fetchSchedule();
    data.previousHash = oldHash;
    if (oldHash && oldHash !== data.hash) {
      console.log('[CHANGE] 课表已变更！');
      data.changed = true;
      fs.writeFileSync('schedule-data.json', JSON.stringify(data, null, 2));
      fs.writeFileSync(NOTIFY_FILE, JSON.stringify({ message: telegramMessage(data), time: new Date().toISOString() }, null, 2), 'utf8');
      console.log('[NOTIFY] 通知已写入 notification.txt');
    } else if (!oldHash) {
      console.log('[INIT] 首次获取课表');
      data.changed = false;
      data.previousHash = null;
      fs.writeFileSync('schedule-data.json', JSON.stringify(data, null, 2));
    } else {
      console.log('[OK] 课表无变化');
    }
    console.log(JSON.stringify({ status: 'ok', group: data.group, changed: data.changed, hash: data.hash }));
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }));
    process.exitCode = 1;
  }
}

function main() {
  const INTERVAL_MS = 30 * 60 * 1000;
  if (process.env.WATCH === '1') {
    console.log('课表监控已启动，每30分钟检查一次...');
    console.log(`配置: ${CONFIG.group} /  faculty=${CONFIG.faculty} dept=${CONFIG.department} course=${CONFIG.course}`);
    checkAndNotify();
    setInterval(checkAndNotify, INTERVAL_MS);
    return;
  }
  checkAndNotify();
}

main();
