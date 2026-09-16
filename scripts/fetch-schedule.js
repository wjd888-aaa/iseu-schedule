const https = require('https');
const fs = require('fs');
const path = require('path');
const { URLSearchParams } = require('url');

const HOST = 'raspisanie.grsu.by';
const BASE = '/TimeTable/UMU.aspx';
const REQUEST_TIMEOUT_MS = 15000;
const TOTAL_TIMEOUT_MS = 30000;
const DATA_FILE = path.join(__dirname, '..', 'schedule-data.json');

const PAGE_URL = 'https://wjd888-aaa.github.io/iseu-schedule/';
const WEEKDAYS_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

const CONFIG = {
  faculty: '3952',
  department: '2',
  course: '1',
  group: 'СДП-ТОВ-261',
  groupValue: '19357',
};

function getPage() {
  return new Promise((resolve, reject) => {
    const o = { hostname: HOST, port: 443, path: BASE, method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,*/*' } };
    const r = https.request(o, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve(b));
    });
    r.setTimeout(REQUEST_TIMEOUT_MS, () => { r.destroy(new Error('站点响应超时')); });
    r.on('error', reject);
    r.end();
  });
}

function postPage(formData) {
  const postData = formData.toString();
  return new Promise((resolve, reject) => {
    const o = {
      hostname: HOST, port: 443, path: BASE, method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Referer': 'https://' + HOST + BASE,
        'Origin': 'https://' + HOST,
        'Connection': 'keep-alive',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: REQUEST_TIMEOUT_MS, rejectUnauthorized: false,
    };
    const r = https.request(o, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve(b));
    });
    r.setTimeout(REQUEST_TIMEOUT_MS, () => { r.destroy(new Error('站点响应超时')); });
    r.on('error', reject);
    r.write(postData);
    r.end();
  });
}

function extractVal(html, name) {
  const m = html.match(new RegExp('name="' + name + '"[^>]*value="([^"]*)"'));
  return m ? m[1] : '';
}

function extractSelect(html, name) {
  const selMatch = html.match(new RegExp('<select[^>]*name="' + name + '"[^>]*>([\\s\\S]*?)</select>'));
  if (!selMatch) return [];
  const opts = selMatch[1].match(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g);
  if (!opts) return [];
  return opts.map(o => ({
    v: o.match(/value="([^"]*)"/)?.[1] || '',
    l: o.match(/>([^<]*)<\/option>/)?.[1]?.trim() || '',
    selected: o.includes('selected'),
  }));
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
  const page = await getPage();

  const viewState = extractVal(page, '__VIEWSTATE');
  const viewStateGen = extractVal(page, '__VIEWSTATEGENERATOR');
  const eventValidation = extractVal(page, '__EVENTVALIDATION');

  const weeks = extractSelect(page, 'ddlWeek');
  const now = new Date();
  let bestWeek = null, bestDiff = Infinity;
  for (const w of weeks) {
    if (!w.v) continue;
    const parts = w.v.split(' ')[0].split('.');
    const dt = new Date(+parts[2], +parts[1] - 1, +parts[0]);
    const diff = Math.abs(now - dt);
    if (diff < bestDiff) { bestDiff = diff; bestWeek = w; }
  }
  if (!bestWeek) throw new Error('No week found');

  const faculties = extractSelect(page, 'ddlFaculty');
  const defaultFaculty = faculties.find((f) => f.selected) || faculties[0];
  const groups = extractSelect(page, 'ddlGroups');
  const defaultGroup = groups.find((g) => g.selected) || groups[0];

  const params = new URLSearchParams();
  params.set('__EVENTTARGET', '');
  params.set('__EVENTARGUMENT', '');
  params.set('__LASTFOCUS', '');
  params.set('__VIEWSTATE', viewState);
  params.set('__VIEWSTATEGENERATOR', viewStateGen);
  params.set('__EVENTVALIDATION', eventValidation);
  params.set('ddlFaculty', defaultFaculty.v);
  params.set('ddlDepartment', CONFIG.department);
  params.set('ddlCourses', CONFIG.course);
  params.set('ddlGroups', CONFIG.groupValue);
  params.set('ddlWeek', bestWeek.v);
  params.set('btnShowTT', '\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C');
  params.set('iframeheight', '0');

  const result = await postPage(params);

  const rows = parseTable(result);
  if (!rows.length) throw new Error('No schedule data');

  const schedule = buildSchedule(rows);

  const [d, m, y] = bestWeek.v.split(' ')[0].split('.');
  const dt = new Date(+y, +m - 1, +d);
  const wn = Math.ceil(((dt - new Date(+y, 0, 1)) / 86400000 + new Date(+y, 0, 1).getDay() + 1) / 7);

  const wkDaysCN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const clean = schedule.map((day) => {
    const idx = WEEKDAYS_RU.findIndex((x) => day.name.includes(x));
    return {
      dayCN: wkDaysCN[idx] || '',
      dayEN: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][idx] || '',
      dayRU: day.name,
      courses: day.courses.map((c) => ({
        time: c[0] || '',
        type: c[1] || '',
        subject: c[2] || '',
        teacher: c[3] || '',
        room: c[4] || '',
      })),
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    week: { label: bestWeek.l, number: wn },
    group: CONFIG.group,
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

async function main() {
  const guard = setTimeout(() => {
    console.error(JSON.stringify({ status: 'error', message: '总用时超过 ' + TOTAL_TIMEOUT_MS / 1000 + ' 秒，终止' }));
    process.exit(1);
  }, TOTAL_TIMEOUT_MS);
  try {
    const data = await fetchSchedule();

    let changed = false;
    let oldHash = '';
    try {
      const old = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      oldHash = old.hash || '';
    } catch (_) {}

    if (oldHash && oldHash !== data.hash) {
      changed = true;
    }

    data.changed = changed;
    data.previousHash = oldHash || null;

    if (changed || !oldHash) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      await telegramNotify(telegramMessage(data));
    }
    clearTimeout(guard);
    console.log(JSON.stringify({ status: 'ok', week: data.week, group: data.group, changed, hash: data.hash }));
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }));
    process.exit(1);
  }
}

main();
