const { base, build, name } = window.SITE;
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let meta;
let classes = [];
let byName = [];
let byPath = new Map();
let children = new Map();
let pkgIndex = new Map();
let pkgClasses = new Map();
let current = null;
let listToken = 0;
let searchIndex = null;
let timer;
const shards = new Map();

async function fetchJson(name) {
  const r = await fetch(`${base}data/${name}?v=${build}`);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r.json();
}

const ePath = (p) => encodeURI(p).replace(/[#?]/g, encodeURIComponent);
const classUrl = (c, id) => `${base}c${ePath(c.path)}${id ? `#${encodeURIComponent(id)}` : ''}`;
const pkgUrl = (p) => `${base}p${ePath(p)}`;
const link = (c) => `<a href="${esc(classUrl(c))}">${esc(c.name)}</a>`;
const hex = (n) => `0x${n.toString(16).toUpperCase()}`;
const isNative = (c) => c.path.startsWith('/Script/');
const pkgOf = (c) => meta.pk[c.pk];

function tstr(d) {
  if (typeof d === 'string') return esc(d);
  const [k, x] = d;
  if (k === 'a' || k === 'S') return `${k === 'a' ? 'TArray' : 'TSet'}&lt;${x ? tstr(x) : '?'}&gt;`;
  const c = classes[x];
  const l = c ? link(c) : null;
  if (k === 'k') return `TSubclassOf&lt;${l || 'UObject'}&gt;`;
  if (k === 'o') return `${l || 'UObject'}*`;
  return l || 'struct';
}

function loadShard(n) {
  if (!shards.has(n)) {
    shards.set(
      n,
      fetchJson(`m/${n}.json`).catch((e) => {
        shards.delete(n);
        throw e;
      }),
    );
  }
  return shards.get(n);
}

async function membersOf(c) {
  if (c.shard < 0) return { f: [], m: [] };
  const s = await loadShard(c.shard);
  return s[c.i] || { f: [], m: [] };
}

function getSearch() {
  if (!searchIndex) searchIndex = fetchJson('search.json');
  return searchIndex;
}

function setTitle(t) {
  document.title = t ? `${t} · ${name}` : name;
}

function markActive() {
  document.querySelectorAll('#list [aria-current]').forEach((a) => a.removeAttribute('aria-current'));
  if (!current) return;
  const a = document.querySelector(`#list a[data-i="${current.i}"]`);
  if (a) a.setAttribute('aria-current', 'page');
}

function focusMember(id) {
  document.querySelectorAll('tr.hl').forEach((r) => r.classList.remove('hl'));
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('hl');
  el.scrollIntoView({ block: 'center' });
}

function inheritedHtml(chain, loaded) {
  let h = '';
  chain.forEach((a, k) => {
    const mm = loaded[k];
    if (!mm.f.length && !mm.m.length) return;
    const names = (list, suffix) =>
      list.map((x) => `<a href="${esc(classUrl(a, x[0] + suffix))}">${esc(x[0])}</a>`).join(', ');
    h +=
      `<details><summary>Inherited from ${esc(a.name)} (${mm.f.length} fields, ${mm.m.length} methods)</summary>` +
      (mm.f.length ? `<p><b>Fields:</b> ${names(mm.f, '')}</p>` : '') +
      (mm.m.length ? `<p><b>Methods:</b> ${names(mm.m, '()')}</p>` : '') +
      '</details>';
  });
  return h ? `<h2>Inherited members</h2><div class="tw inh">${h}</div>` : '';
}

function classHtml(c, mm, ancestors, loaded) {
  const chain = [];
  for (let a = c; a && chain.length < 64; a = classes[a.sup]) chain.unshift(a);
  const tree = chain
    .map((a, i) => (i ? `${'   '.repeat(i - 1)}└─ ` : '') + (a === c ? `<b>${esc(a.name)}</b>` : link(a)))
    .join('\n');
  const kids = children.get(c.i) || [];
  let h = `<div class="pkg"><a href="${esc(pkgUrl(pkgOf(c)))}">${esc(pkgOf(c))}</a></div>`;
  h += `<h1>${c.struct ? 'Struct' : 'Class'} ${esc(c.name)}</h1><pre class="tree">${tree}</pre>`;
  if (kids.length) {
    h += `<div class="sub"><b>${c.struct ? 'Child structs' : 'Direct subclasses'}:</b> ${kids.slice(0, 60).map(link).join(', ')}`;
    h += kids.length > 60 ? ` and ${kids.length - 60} more</div>` : '</div>';
  }
  if (mm.f.length) {
    h += `<h2>Field summary</h2><div class="tw"><table>${mm.f
      .map(
        ([n, t, o]) =>
          `<tr id="${esc(n)}"><td class="t">${tstr(t)}</td>` +
          `<td><a class="anc" href="${esc(classUrl(c, n))}">${esc(n)}</a></td><td class="o">${hex(o)}</td></tr>`,
      )
      .join('')}</table></div>`;
  }
  if (mm.m.length) {
    h += `<h2>Method summary</h2><div class="tw"><table>${mm.m
      .map(
        ([n, r, ps]) =>
          `<tr id="${esc(n)}()"><td class="t">${r ? tstr(r) : 'void'}</td>` +
          `<td><a class="anc" href="${esc(classUrl(c, `${n}()`))}">${esc(n)}</a>` +
          `(${ps.map(([pn, pt]) => `${tstr(pt)} ${esc(pn)}`).join(', ')})</td></tr>`,
      )
      .join('')}</table></div>`;
  }
  if (!mm.f.length && !mm.m.length) h += '<p class="muted">Nothing declared on this type.</p>';
  return h + inheritedHtml(ancestors, loaded);
}

async function showClass(c, id) {
  const main = $('#main');
  if (current !== c) {
    current = c;
    setTitle(c.name);
    main.innerHTML = '<p class="muted">Loading…</p>';
    markActive();
    const ancestors = [];
    for (let a = classes[c.sup]; a && ancestors.length < 64; a = classes[a.sup]) ancestors.push(a);
    try {
      const [mm, ...loaded] = await Promise.all([c, ...ancestors].map(membersOf));
      if (current !== c) return;
      main.innerHTML = classHtml(c, mm, ancestors, loaded);
      main.scrollTop = 0;
    } catch (e) {
      if (current === c) main.innerHTML = `<p>Failed to load members: ${esc(e.message)}</p>`;
      return;
    }
  }
  focusMember(id);
}

function showPackage(name) {
  current = null;
  markActive();
  const list = pkgClasses.get(pkgIndex.get(name));
  if (!list) return notFound();
  setTitle(name);
  $('#main').innerHTML =
    `<div class="pkg">Package</div><h1>${esc(name || '(none)')}</h1>` +
    `<h2>Classes and structs (${list.length.toLocaleString()})</h2><div class="tw"><table>` +
    list
      .map(
        (c) =>
          `<tr><td class="t">${c.struct ? 'struct' : 'class'}</td><td>${link(c)}</td>` +
          `<td class="o">${classes[c.sup] ? `extends ${link(classes[c.sup])}` : ''}</td></tr>`,
      )
      .join('') +
    '</table></div>';
  $('#main').scrollTop = 0;
}

function showHome() {
  current = null;
  markActive();
  setTitle('');
  const native = meta.pk
    .map((p, i) => [p, pkgClasses.get(i).length])
    .filter(([p]) => p.startsWith('/Script/'))
    .sort((a, b) => b[1] - a[1]);
  const structs = classes.filter((c) => c.struct).length;
  $('#main').innerHTML =
    `<div class="intro"><h1>${esc(name)}</h1>` +
    `<div class="stats"><span><b>${(classes.length - structs).toLocaleString()}</b>classes</span>` +
    `<span><b>${structs.toLocaleString()}</b>structs</span>` +
    `<span><b>${meta.counts.fields.toLocaleString()}</b>fields</span>` +
    `<span><b>${meta.counts.methods.toLocaleString()}</b>methods</span></div>` +
    '<p class="muted">Pick a class on the left or search above. Every class, package and member has its own URL.</p></div>' +
    `<h2>Native packages (${native.length})</h2><div class="tw"><table>` +
    native
      .map(([p, n]) => `<tr><td><a href="${esc(pkgUrl(p))}">${esc(p)}</a></td><td class="o">${n.toLocaleString()}</td></tr>`)
      .join('') +
    '</table></div>';
  $('#main').scrollTop = 0;
}

function notFound() {
  current = null;
  markActive();
  setTitle('Not found');
  $('#main').innerHTML = `<h1>Not found</h1><p>No class or package at this address. <a href="${esc(base)}">Back to overview</a></p>`;
}

function route() {
  let path;
  let id;
  try {
    path = decodeURI(location.pathname.slice(base.length));
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    return notFound();
  }
  if (path.startsWith('c/')) {
    const c = byPath.get(`/${path.slice(2)}`);
    return c ? showClass(c, id) : notFound();
  }
  if (path.startsWith('p/')) return showPackage(`/${path.slice(2)}`);
  return showHome();
}

function navigate(href) {
  if (href !== location.href) history.pushState(null, '', href);
  route();
}

function item(c) {
  return (
    `<a href="${esc(classUrl(c))}" data-i="${c.i}" title="${esc(c.path)}">` +
    `<span class="b">${c.struct ? 'S' : 'C'}</span>${esc(c.name)}</a>`
  );
}

async function renderList() {
  const token = ++listToken;
  const q = $('#q').value.trim().toLowerCase();
  const nat = $('#nat').checked;
  let h = '';
  let shown = 0;
  let total = 0;
  for (const c of byName) {
    if (nat && !isNative(c)) continue;
    if (q && !c.name.toLowerCase().includes(q)) continue;
    total++;
    if (shown < 400) {
      shown++;
      h += item(c);
    }
  }
  h = `<h3>Types (${total.toLocaleString()}${total > shown ? `, showing ${shown}` : ''})</h3>${h}`;
  $('#list').innerHTML = h;
  markActive();
  if (q.length < 3) return;

  $('#list').insertAdjacentHTML('beforeend', '<div id="mem"><h3>Members</h3><a>Searching…</a></div>');
  const idx = await getSearch();
  if (token !== listToken) return;
  let mh = '';
  let n = 0;
  for (let i = 0; i < idx.n.length; i++) {
    if (!idx.n[i].toLowerCase().includes(q)) continue;
    const c = classes[idx.c[i]];
    if (nat && !isNative(c)) continue;
    if (++n > 200) break;
    const m = idx.k[i] === 'm';
    mh +=
      `<a href="${esc(classUrl(c, m ? `${idx.n[i]}()` : idx.n[i]))}" title="${esc(c.path)}">` +
      `<span class="b">${m ? 'm' : 'f'}</span>${esc(c.name)}.${esc(idx.n[i])}</a>`;
  }
  $('#mem').innerHTML = `<h3>${n > 200 ? 'Members (first 200)' : 'Members'}</h3>${mh || '<a>No matches</a>'}`;
}

function syncQuery() {
  const u = new URL(location.href);
  const q = $('#q').value.trim();
  if (q) u.searchParams.set('q', q);
  else u.searchParams.delete('q');
  history.replaceState(null, '', u);
}

function stamp() {
  const version = meta.version ? `Server ${esc(meta.version)}` : '';
  const commit =
    meta.repo && meta.commit
      ? `<a href="https://github.com/${esc(meta.repo)}/commit/${esc(meta.commit)}">${esc(meta.commit.slice(0, 7))}</a>`
      : '';
  $('#stamp').innerHTML = [version, commit].filter(Boolean).join(' · ');
}

async function init() {
  meta = await fetchJson('meta.json');
  classes = meta.c.map(([name, pk, sup, st, shard], i) => ({
    i,
    name,
    pk,
    sup,
    shard,
    struct: !!st,
    path: meta.pk[pk] ? `${meta.pk[pk]}.${name}` : name,
  }));
  meta.pk.forEach((p, i) => {
    pkgIndex.set(p, i);
    pkgClasses.set(i, []);
  });
  for (const c of classes) {
    byPath.set(c.path, c);
    pkgClasses.get(c.pk).push(c);
    if (c.sup >= 0) {
      if (!children.has(c.sup)) children.set(c.sup, []);
      children.get(c.sup).push(c);
    }
  }
  byName = classes.slice().sort((a, b) => {
    const x = a.name.toLowerCase();
    const y = b.name.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
  stamp();
  const params = new URLSearchParams(location.search);
  $('#q').value = params.get('q') || '';
  try {
    $('#nat').checked = localStorage.getItem('native') !== '0';
  } catch {}
  renderList();
  route();
}

document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download')) return;
  if (a.origin !== location.origin || !a.pathname.startsWith(base)) return;
  e.preventDefault();
  navigate(a.href);
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
    e.preventDefault();
    $('#q').focus();
  } else if (e.key === 'Escape' && document.activeElement === $('#q')) {
    $('#q').blur();
  }
});

$('#q').addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    syncQuery();
    renderList();
  }, 150);
});

$('#nat').addEventListener('change', () => {
  try {
    localStorage.setItem('native', $('#nat').checked ? '1' : '0');
  } catch {}
  renderList();
});

addEventListener('popstate', route);

init().catch((e) => {
  $('#main').innerHTML = `<h1>Failed to load</h1><p>${esc(e.message)}</p>`;
});
