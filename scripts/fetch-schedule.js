const https = require('https');
const http = require('http');
const fs = require('fs');

const HOST = 'rsp.iseu.by';
const BASE = '/Raspisanie/TimeTable/Magistranty.aspx';
const REQUEST_TIMEOUT_MS = 60000;
const TOTAL_TIMEOUT_MS = 300000;

const CONFIG = {
  faculty: '4',
  department: '2',
  course: '1',
  groupAuto: true,
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

function closestWeek(html) {
  const opts = getOptions(html, 'ddlWeek');
  const now = new Date();
  let best = null, bd = Infinity;
  for (const o of opts) {
    const [d, m, y] = o.v.split(' ')[0].split('.');
    const dt = new Date(+y, +m - 1, +d);
    const diff = Math.abs(now - dt);
    if (diff < bd) { bd = diff; best = o; }
  }
  return best;
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
  const s = str.replace(/__VIEWSTATE\|[^|]+\|/g, '').replace(/__EVENTVALIDATION\|[^|]+\|/g, '');
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return h.toString(36);
}

async function fetchSchedule() {
  let html = await req('GET');
  html = await postback(html, 'ddlFac', { ddlFac: CONFIG.faculty, ddlDep: '', ddlCourse: '', ddlGroup: '', ddlWeek: '' });
  html = await postback(html, 'ddlDep', { ddlFac: CONFIG.faculty, ddlDep: CONFIG.department, ddlCourse: '', ddlGroup: '', ddlWeek: '' });
  html = await postback(html, 'ddlCourse', { ddlFac: CONFIG.faculty, ddlDep: CONFIG.department, ddlCourse: CONFIG.course, ddlGroup: '', ddlWeek: '' });

  const groups = getOptions(html, 'ddlGroup');
  if (!groups.length) throw new Error('No groups');
  const grp = groups[groups.length - 1];

  const wk = closestWeek(html);
  if (!wk) throw new Error('No week');

  const res = await postback(html, 'btnShow', {
    ddlFac: CONFIG.faculty, ddlDep: CONFIG.department, ddlCourse: CONFIG.course,
    ddlGroup: grp.v, ddlWeek: wk.v,
    btnShow: '\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C',
  });

  const rows = parseTable(res);
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
    week: { label: wk.l, number: wn },
    group: grp.l,
    schedule: clean,
    hash: hash(res),
  };
}

async function main() {
  const guard = setTimeout(() => {
    console.error(JSON.stringify({ status: 'error', message: '总用时超过 ' + TOTAL_TIMEOUT_MS / 1000 + ' 秒，终止（站点可能无响应）' }));
    process.exit(1);
  }, TOTAL_TIMEOUT_MS);
  try {
    const data = await fetchSchedule();

    let changed = false;
    let oldHash = '';
    try {
      const old = JSON.parse(fs.readFileSync('schedule-data.json', 'utf8'));
      oldHash = old.hash || '';
    } catch (_) {}

    if (oldHash && oldHash !== data.hash) {
      changed = true;
    }

    data.changed = changed;
    data.previousHash = oldHash || null;

    fs.writeFileSync('schedule-data.json', JSON.stringify(data, null, 2));
    clearTimeout(guard);
    console.log(JSON.stringify({ status: 'ok', week: data.week, group: data.group, changed, hash: data.hash }));
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }));
    process.exit(1);
  }
}

main();
