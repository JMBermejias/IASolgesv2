/**
 * IASolges.v2 - Integracion con GitHub (repositorio, publicaciones y releases)
 */
const fs = require('fs');
const path = require('path');
const { getSettings } = require('./config');

function cfg() {
  const g = getSettings().github || {};
  const owner = g.repo ? String(g.repo).split('/')[0] : 'JMBermejias';
  const repo = g.repo ? String(g.repo).split('/')[1] : 'IASolgesv2';
  return { user: g.user || 'jmbernabeu', owner, repo, token: g.token || '', url: g.url || `https://github.com/${owner}/${repo}` };
}

async function api(endpoint, { method = 'GET', body, raw = false } = {}) {
  const { token } = cfg();
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'IASolges.v2'
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`https://api.github.com${endpoint}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined
  });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { json = { message: text }; }
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status}: ${(json && json.message) || text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function repoInfo() {
  const { owner, repo, url, token } = cfg();
  try {
    const data = await api(`/repos/${owner}/${repo}`);
    return {
      ok: true, connected: Boolean(token), owner, repo, url,
      fullName: data.full_name, description: data.description, stars: data.stargazers_count,
      forks: data.forks_count, private: data.private, defaultBranch: data.default_branch,
      pushedAt: data.pushed_at, license: data.license ? data.license.spdx_id : null
    };
  } catch (e) {
    return { ok: false, connected: Boolean(token), owner, repo, url, error: e.message };
  }
}

async function userInfo() {
  const { token } = cfg();
  if (!token) return { ok: false, error: 'Sin token de acceso' };
  try {
    const data = await api('/user');
    return { ok: true, login: data.login, name: data.name, avatar: data.avatar_url, url: data.html_url };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function listReleases() {
  const { owner, repo } = cfg();
  try {
    const data = await api(`/repos/${owner}/${repo}/releases?per_page=10`);
    return (data || []).map((r) => ({
      tag: r.tag_name, name: r.name, publishedAt: r.published_at, prerelease: r.prerelease,
      notes: r.body, url: r.html_url,
      assets: (r.assets || []).map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url, id: a.id }))
    }));
  } catch (e) {
    return [];
  }
}

function collectFiles(dir, base = dir, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return acc; }
  for (const e of entries) {
    if (['node_modules', '.git', 'dist', '.cache'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectFiles(full, base, acc);
    else {
      const st = fs.statSync(full);
      if (st.size > 900000) continue;
      acc.push({ path: path.relative(base, full).split(path.sep).join('/'), content: fs.readFileSync(full) });
    }
  }
  return acc;
}

/** Publica un proyecto generado en una rama propia del repositorio */
async function publishProject({ dir, nombre, branchPrefix = 'iasolges' }) {
  const { owner, repo, token } = cfg();
  if (!token) throw new Error('Falta el token de GitHub. Configuralo en Ajustes.');
  const slug = (nombre || path.basename(dir)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const branch = `${branchPrefix}/${slug}-${Date.now().toString(36)}`;

  const ref = await api(`/repos/${owner}/${repo}/git/ref/heads/main`).catch(() => null)
    || await api(`/repos/${owner}/${repo}/git/ref/heads/${(await repoInfo()).defaultBranch || 'main'}`);
  const baseCommit = await api(`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);

  const files = collectFiles(dir);
  const treeItems = [];
  for (const f of files) {
    const blob = await api(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: { content: f.content.toString('base64'), encoding: 'base64' }
    });
    treeItems.push({ path: `${slug}/${f.path}`, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const tree = await api(`/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: { base_tree: baseCommit.tree.sha, tree: treeItems }
  });

  const commit = await api(`/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: {
      message: `Proyecto "${nombre}" generado por IASolges.v2`,
      tree: tree.sha,
      parents: [ref.object.sha]
    }
  });

  await api(`/repos/${owner}/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit.sha } });

  return {
    ok: true, branch,
    url: `https://github.com/${owner}/${repo}/tree/${branch}`,
    archivos: files.length,
    commit: commit.sha.slice(0, 8)
  };
}

async function createRelease({ tag, name, notes, assets = [] }) {
  const { owner, repo } = cfg();
  return api(`/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    body: { tag_name: tag, name, body: notes, draft: false, prerelease: false }
  });
}

async function uploadAsset(releaseId, filePath) {
  const { owner, repo, token } = cfg();
  const name = path.basename(filePath);
  const stat = fs.statSync(filePath);
  const buf = fs.readFileSync(filePath);
  const res = await fetch(`https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(stat.size),
      'User-Agent': 'IASolges.v2'
    },
    body: buf
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

module.exports = { cfg, api, repoInfo, userInfo, listReleases, publishProject, createRelease, uploadAsset };