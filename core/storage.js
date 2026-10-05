
export const PUBLIC_OBJECT_API = '/storage/v1/object/public/';

export function publicObjectUrl(supabaseUrl, bucket, path) {
  if (typeof supabaseUrl !== 'string' || supabaseUrl === '') throw new TypeError('supabaseUrl');
  if (typeof bucket !== 'string' || bucket === '') throw new TypeError('bucket');
  if (typeof path !== 'string' || path === '' || path.startsWith('/')) throw new TypeError('path 는 비지 않은 상대 경로');
  const base = supabaseUrl.replace(/\/+$/, '');
  const enc = path.split('/').map((seg) => encodeURIComponent(seg)).join('/');
  return `${base}${PUBLIC_OBJECT_API}${encodeURIComponent(bucket)}/${enc}`;
}

export function normalizedStatus(status, bodyText) {
  if (status !== 400 || typeof bodyText !== 'string' || bodyText === '') return status;
  const notFound = bodyText.includes('"statusCode":"404"') || bodyText.includes('"NoSuchKey"') || bodyText.includes('"not_found"');
  return notFound ? 404 : status;
}

export function fileOutcome({ status, phase, buildChanged }) {
  if (status === 200) return 'show';
  if (status === 404) {
    if (phase === 'after_requery') return buildChanged ? 'refetch' : 'hide';
    return 'requery_build';
  }
  return 'retry';
}


const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

export async function gunzip(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  const b = bytes;
  if (b.length < 18 || b[0] !== 0x1f || b[1] !== 0x8b || b[2] !== 8 || (b[3] & 0xe0) !== 0) return null;
  const flg = b[3];
  let p = 10;
  try {
    if (flg & 4) {
      if (p + 2 > b.length) return null;
      const xlen = b[p] | (b[p + 1] << 8);
      p += 2 + xlen;
    }
    if (flg & 8) {
      while (p < b.length && b[p] !== 0) p += 1;
      p += 1;
    }
    if (flg & 16) {
      while (p < b.length && b[p] !== 0) p += 1;
      p += 1;
    }
    if (flg & 2) p += 2;
    if (p + 8 > b.length) return null;
    const body = b.subarray(p, b.length - 8);
    const out = await inflateRaw(body);
    const tail = b.length - 8;
    const crc = (b[tail] | (b[tail + 1] << 8) | (b[tail + 2] << 16) | (b[tail + 3] << 24)) >>> 0;
    const isize = (b[tail + 4] | (b[tail + 5] << 8) | (b[tail + 6] << 16) | (b[tail + 7] << 24)) >>> 0;
    if (crc32(out) !== crc || out.length % 0x100000000 !== isize) return null;
    return out;
  } catch {
    return null;
  }
}

export async function gunzipToText(bytes) {
  const out = await gunzip(bytes);
  if (out === null) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(out);
  } catch {
    return null;
  }
}

export function bytesFromBase64(b64) {
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 !== 0) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}


export function pointerAccept(pointer, { knownFormats, formatKey = 'format', buildKey = 'build_id' } = {}) {
  if (!Array.isArray(knownFormats) || knownFormats.length === 0) throw new TypeError('knownFormats');
  if (pointer === null || typeof pointer !== 'object' || Array.isArray(pointer)) return { ok: false, format: null, buildId: null };
  const f = pointer[formatKey];
  const bid = pointer[buildKey];
  const ok = Number.isSafeInteger(f) && knownFormats.includes(f) && Number.isSafeInteger(bid) && bid > 0;
  return ok ? { ok: true, format: f, buildId: bid } : { ok: false, format: null, buildId: null };
}


export class StorageLoader {
  constructor({ supabaseUrl, bucket, fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl 이 필요하다');
    this.supabaseUrl = supabaseUrl;
    this.bucket = bucket;
    this.fetchImpl = fetchImpl;
  }

  objectUrl(path) {
    return publicObjectUrl(this.supabaseUrl, this.bucket, path);
  }

  async getBytes(path, { signal } = {}) {
    let res;
    try {
      res = await this.fetchImpl(this.objectUrl(path), { signal });
    } catch {
      return { status: null, bytes: null };
    }
    let bytes = null;
    try {
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch {
      bytes = null;
    }
    let status = res.status;
    if (status === 400 && bytes !== null) {
      status = normalizedStatus(status, new TextDecoder().decode(bytes.subarray(0, 4096)));
    }
    return { status, bytes };
  }

  async getJson(path, { gzip = true, signal } = {}) {
    const { status, bytes } = await this.getBytes(path, { signal });
    if (status !== 200 || bytes === null) return { status, doc: null, corrupt: false };
    let text = null;
    if (gzip) text = await gunzipToText(bytes);
    else {
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        text = null;
      }
    }
    if (text === null) return { status, doc: null, corrupt: true };
    try {
      return { status, doc: JSON.parse(text), corrupt: false };
    } catch {
      return { status, doc: null, corrupt: true };
    }
  }

  async loadViaPointer({ pointerPath, pathFor, knownFormats, pointerKeys = {}, signal } = {}) {
    if (typeof pathFor !== 'function') throw new TypeError('pathFor 함수가 필요하다');
    const readPointer = async () => {
      const p = await this.getJson(pointerPath, { gzip: false, signal });
      if (p.status !== 200 || p.corrupt) return { acc: null, reason: p.status === 404 ? 'pointer_missing' : 'pointer_unavailable' };
      const acc = pointerAccept(p.doc, { knownFormats, ...pointerKeys });
      return acc.ok ? { acc: { format: acc.format, buildId: acc.buildId }, reason: '' } : { acc: null, reason: 'pointer_unknown_format' };
    };
    const first = await readPointer();
    if (first.acc === null) return { state: first.reason === 'pointer_unknown_format' ? 'hide' : 'retry', doc: null, build: null, reason: first.reason };
    const f1 = await this.getJson(pathFor(first.acc), { gzip: true, signal });
    if (f1.corrupt) return { state: 'retry', doc: null, build: first.acc, reason: 'file_corrupt' };
    const o1 = fileOutcome({ status: f1.status, phase: 'first', buildChanged: false });
    if (o1 === 'show') return { state: 'show', doc: f1.doc, build: first.acc, reason: '' };
    if (o1 !== 'requery_build') return { state: 'retry', doc: null, build: first.acc, reason: `file_${f1.status}` };
    const second = await readPointer();
    if (second.acc === null) return { state: second.reason === 'pointer_unknown_format' ? 'hide' : 'retry', doc: null, build: null, reason: second.reason };
    const changed = second.acc.buildId !== first.acc.buildId || second.acc.format !== first.acc.format;
    const o2 = fileOutcome({ status: 404, phase: 'after_requery', buildChanged: changed });
    if (o2 === 'hide') return { state: 'hide', doc: null, build: second.acc, reason: 'file_missing_same_build' };
    const f2 = await this.getJson(pathFor(second.acc), { gzip: true, signal });
    if (f2.corrupt) return { state: 'retry', doc: null, build: second.acc, reason: 'file_corrupt' };
    if (f2.status === 200) return { state: 'show', doc: f2.doc, build: second.acc, reason: '' };
    if (f2.status === 404) return { state: 'hide', doc: null, build: second.acc, reason: 'file_missing_new_build' };
    return { state: 'retry', doc: null, build: second.acc, reason: `file_${f2.status}` };
  }
}


export function looksGzip(bytes) {
  return bytes instanceof Uint8Array && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export async function gunzipStream(bytes) {
  if (!(bytes instanceof Uint8Array) || typeof DecompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

export async function decodeJsonMaybeGzip(bytes) {
  if (!(bytes instanceof Uint8Array)) return { doc: null, corrupt: true };
  let plain = bytes;
  if (looksGzip(bytes)) {
    plain = (await gunzipStream(bytes)) ?? (await gunzip(bytes));
    if (plain === null) return { doc: null, corrupt: true };
  }
  try {
    return { doc: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)), corrupt: false };
  } catch {
    return { doc: null, corrupt: true };
  }
}

export async function fetchBytes(fetchImpl, url, { signal } = {}) {
  let res;
  try {
    res = await fetchImpl(url, { signal });
  } catch {
    return { status: null, bytes: null };
  }
  let bytes = null;
  try {
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    bytes = null;
  }
  let status = res.status;
  if (status === 400 && bytes !== null) status = normalizedStatus(status, new TextDecoder().decode(bytes.subarray(0, 4096)));
  return { status, bytes };
}

export function pointerFiles(pointer) {
  const f = pointer && pointer.files;
  if (f === null || typeof f !== 'object' || Array.isArray(f)) return null;
  for (const v of Object.values(f)) if (typeof v !== 'string') return null;
  return f;
}

export class JikjuStore {
  constructor({ fetchImpl = globalThis.fetch, urlFor, pointerPath = 'jikju/current.json', knownFormats = [1], filePath, pointerTtlMs = 30 * 60 * 1000, now = () => Date.now() } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl 이 필요하다');
    if (typeof urlFor !== 'function') throw new TypeError('urlFor 함수가 필요하다');
    if (typeof filePath !== 'function') throw new TypeError('filePath(=jikjuFilePath) 함수가 필요하다');
    this.fetchImpl = fetchImpl;
    this.urlFor = urlFor;
    this.pointerPath = pointerPath;
    this.knownFormats = knownFormats;
    this.filePath = filePath;
    this.pointerTtlMs = pointerTtlMs;
    this.now = now;
    this.gen = null; // { pointer, build: {format, buildId}, files, loadedAt, docs: Map(name → doc) }
    this.calls = []; // 요청한 경로(시험·진단용)
  }

  generation() {
    return this.gen;
  }

  async #get(path, signal) {
    this.calls.push(path);
    return fetchBytes(this.fetchImpl, this.urlFor(path), { signal });
  }

  async pointer({ force = false, signal } = {}) {
    if (!force && this.gen && this.now() - this.gen.loadedAt < this.pointerTtlMs) return { ok: true, reason: '' };
    const r = await this.#get(this.pointerPath, signal);
    if (r.status !== 200 || r.bytes === null) return { ok: false, reason: r.status === 404 ? 'pointer_missing' : 'pointer_unavailable' };
    const { doc, corrupt } = await decodeJsonMaybeGzip(r.bytes);
    if (corrupt) return { ok: false, reason: 'pointer_corrupt' };
    const acc = pointerAccept(doc, { knownFormats: this.knownFormats });
    if (!acc.ok) return { ok: false, reason: 'pointer_unknown_format' };
    const files = pointerFiles(doc);
    if (files === null) return { ok: false, reason: 'pointer_no_files' };
    const build = { format: acc.format, buildId: acc.buildId };
    if (this.gen && this.gen.build.buildId === build.buildId && this.gen.build.format === build.format) {
      this.gen.loadedAt = this.now();
      this.gen.pointer = doc;
      this.gen.files = files;
    } else {
      this.gen = { pointer: doc, build, files, loadedAt: this.now(), docs: new Map() };
    }
    return { ok: true, reason: '' };
  }

  has(name) {
    return Boolean(this.gen && Object.hasOwn(this.gen.files, name));
  }

  async file(name, { signal } = {}) {
    const p = await this.pointer({ signal });
    if (!p.ok) return { state: 'retry', doc: null, reason: p.reason };
    if (!this.has(name)) return { state: 'hide', doc: null, reason: 'absent' };
    const gen = this.gen;
    if (gen.docs.has(name)) return { state: 'show', doc: gen.docs.get(name), reason: '' };
    const first = await this.#fetchNamed(gen, name, signal);
    if (first.state !== 'requery') return first;
    const again = await this.pointer({ force: true, signal });
    if (!again.ok) return { state: 'retry', doc: null, reason: again.reason };
    const gen2 = this.gen;
    const changed = gen2 !== gen || gen2.files[name] !== gen.files[name];
    if (!changed) return { state: 'hide', doc: null, reason: 'file_missing_same_build' };
    if (!this.has(name)) return { state: 'hide', doc: null, reason: 'absent' };
    const second = await this.#fetchNamed(gen2, name, signal);
    if (second.state === 'requery') return { state: 'hide', doc: null, reason: 'file_missing_new_build' };
    return second;
  }

  async #fetchNamed(gen, name, signal) {
    let fp;
    try {
      fp = this.filePath(gen.files, name);
    } catch {
      return { state: 'hide', doc: null, reason: 'bad_sha' }; // sha 형식이 틀린 포인터 — 잘못된 경로를 만들지 않고 숨긴다
    }
    const r = await this.#get(fp.path, signal);
    if (r.status === 404) return { state: 'requery', doc: null, reason: 'file_404' };
    if (r.status !== 200 || r.bytes === null) return { state: 'retry', doc: null, reason: `file_${r.status}` };
    const { doc, corrupt } = await decodeJsonMaybeGzip(r.bytes);
    if (corrupt) return { state: 'retry', doc: null, reason: 'file_corrupt' };
    if (this.gen === gen) gen.docs.set(name, doc);
    return { state: 'show', doc, reason: '' };
  }
}
