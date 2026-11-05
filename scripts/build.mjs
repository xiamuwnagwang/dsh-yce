#!/usr/bin/env node
/**
 * Self-contained standalone builder for `dsh-yce`:
 *  1. Strict TypeScript typecheck against `./tsconfig.json`
 *  2. Emit `lib/index.js` (Host Cordis ESM plugin) + `lib/index.d.ts`
 *  3. Emit `lib/client.js` (`window.__ModuleLoader__.load({ id: "dsh-yce", factory })`)
 *  4. Generate 256x256 `icon.png`
 *  5. Deterministically pack an npm-compatible `.tgz` buffer (and write if `outFile` given)
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, gunzipSync, gzipSync } from 'node:zlib'
import ts from 'typescript'

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = path.join(PLUGIN_DIR, 'src')
const LIB_DIR = path.join(PLUGIN_DIR, 'lib')

const HOST_MODULES = [
  'protocol.ts',
  'mcp-enhance.ts',
  'rpc.ts',
  'index.ts',
]

const CLIENT_MODULES = [
  'protocol.ts',
  'client/constants.ts',
  'client/locales.ts',
  'client/restore-store.ts',
  'client/styles.ts',
  'client/wand-button.tsx',
  'client/index.ts',
]

export const TARBALL_FILES = [
  'package.json',
  'LICENSE',
  'README.md',
  'cordis.patch.yml',
  'icon.png',
  'locale/zh.json',
  'locale/en.json',
  'lib/index.js',
  'lib/index.d.ts',
  'lib/client.js',
]

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function typecheckDshPlugin() {
  const configPath = path.join(PLUGIN_DIR, 'tsconfig.json')
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile)
  if (readResult.error) {
    throw new Error(ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n'))
  }
  const parsed = ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    PLUGIN_DIR,
  )
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true },
  })
  const diagnostics = [
    ...parsed.errors,
    ...ts.getPreEmitDiagnostics(program),
  ]
  if (diagnostics.length > 0) {
    const host = {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => PLUGIN_DIR,
      getNewLine: () => '\n',
    }
    throw new Error(`TypeScript check failed:\n${ts.formatDiagnosticsWithColorAndContext(diagnostics, host)}`)
  }
}

function transpileToCjs(relId) {
  const absPath = path.join(SRC_DIR, relId)
  const source = readFileSync(absPath, 'utf8')
  const isTsx = relId.endsWith('.tsx')
  const result = ts.transpileModule(source, {
    fileName: absPath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: isTsx ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve,
      esModuleInterop: true,
      isolatedModules: true,
      removeComments: false,
    },
  })
  if (result.diagnostics && result.diagnostics.length > 0) {
    const msg = result.diagnostics
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      .join('\n')
    throw new Error(`Transpile error in ${relId}:\n${msg}`)
  }
  return result.outputText
}

function buildModuleRegistrySource(moduleIds, allowExternalRequire) {
  const entries = moduleIds.map((relId) => {
    const code = transpileToCjs(relId)
    return `  ${JSON.stringify(relId)}: function (require, module, exports) {\n${code}\n  }`
  })

  const externalBranch = allowExternalRequire
    ? 'if (typeof outerRequire === "function") return outerRequire(specifier);\n    throw new Error("External require unavailable for " + specifier);'
    : 'throw new Error("Unexpected external require in host bundle: " + specifier);'

  return [
    'const __modules = {',
    entries.join(',\n'),
    '};',
    'const __cache = Object.create(null);',
    'function __resolve(fromDir, specifier) {',
    '  const parts = (fromDir ? fromDir.split("/") : []);',
    '  for (const seg of specifier.split("/")) {',
    '    if (!seg || seg === ".") continue;',
    '    if (seg === "..") parts.pop();',
    '    else parts.push(seg);',
    '  }',
    '  const candidate = parts.join("/");',
    '  if (__modules[candidate]) return candidate;',
    '  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {',
    '    if (__modules[candidate + ext]) return candidate + ext;',
    '  }',
    '  throw new Error("Cannot resolve internal module " + specifier + " from " + fromDir);',
    '}',
    'function __load(id, outerRequire) {',
    '  if (__cache[id]) return __cache[id].exports;',
    '  const fn = __modules[id];',
    '  if (!fn) throw new Error("Unknown internal module: " + id);',
    '  const mod = { exports: {} };',
    '  __cache[id] = mod;',
    '  const slash = id.lastIndexOf("/");',
    '  const dir = slash >= 0 ? id.slice(0, slash) : "";',
    '  const localRequire = (specifier) => {',
    '    if (specifier.startsWith("./") || specifier.startsWith("../")) {',
    '      return __load(__resolve(dir, specifier), outerRequire);',
    '    }',
    `    ${externalBranch}`,
    '  };',
    '  fn(localRequire, mod, mod.exports);',
    '  return mod.exports;',
    '}',
  ].join('\n')
}

function buildHostBundle() {
  const registry = buildModuleRegistrySource(HOST_MODULES, false)
  return [
    '// Generated by scripts/build.mjs — do not edit by hand.',
    registry,
    'const __entry = __load("index.ts");',
    'export const name = __entry.name;',
    'export const inject = __entry.inject;',
    'export function apply(ctx) {',
    '  return __entry.apply(ctx);',
    '}',
    '',
  ].join('\n')
}

function buildHostTypes() {
  return [
    "import type { Context } from '@deepseek-ai/cordis';",
    'export declare const name = "dsh-yce";',
    'export declare const inject: string[];',
    'export declare function apply(ctx: Context): void;',
    '',
  ].join('\n')
}

function buildClientBundle(pluginId) {
  const registry = buildModuleRegistrySource(CLIENT_MODULES, true)
  return [
    `window.__ModuleLoader__.load({ id: ${JSON.stringify(pluginId)}, factory: (require) => {`,
    'var module = { exports: {} }; var exports = module.exports;',
    registry,
    'module.exports = __load("client/index.ts", require);',
    'return module.exports; } });',
    '',
  ].join('\n')
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v)
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const c1 = vx * wx + vy * wy
  if (c1 <= 0) return Math.hypot(px - ax, py - ay)
  const c2 = vx * vx + vy * vy
  if (c2 <= c1) return Math.hypot(px - bx, py - by)
  const b = c1 / c2
  return Math.hypot(px - (ax + b * vx), py - (ay + b * vy))
}

function roundedBoxSdf(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius)
  const qy = Math.abs(py - cy) - (halfH - radius)
  const outDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  const inDist = Math.min(Math.max(qx, qy), 0)
  return outDist + inDist - radius
}

function generateIconPng(size = 256) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * stride
    raw[rowOffset] = 0
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5
      const py = y + 0.5

      const boxDist = roundedBoxSdf(px, py, 128, 128, 114, 114, 54)
      const bgAlpha = 1 - smoothstep(-0.8, 0.9, boxDist)
      if (bgAlpha <= 0.001) continue

      const diag = (px + py) / (size * 2)
      const glow = Math.exp(-((px - 188) ** 2 + (py - 68) ** 2) / (2 * 78 * 78))
      let r = 24 + diag * 14 + glow * 44
      let g = 19 + diag * 10 + glow * 26
      let b = 16 + diag * 8 + glow * 14

      const borderBand = 1 - smoothstep(0.6, 2.4, Math.abs(boxDist + 3.5))
      r += borderBand * (232 - r) * 0.42
      g += borderBand * (170 - g) * 0.42
      b += borderBand * (120 - b) * 0.42

      const dLeft = distToSegment(px, py, 68, 72, 118, 134)
      const dRight = distToSegment(px, py, 168, 72, 118, 134)
      const dStem = distToSegment(px, py, 118, 134, 118, 194)
      const yDist = Math.min(dLeft, dRight, dStem) - 12.5
      const yAlpha = 1 - smoothstep(-0.9, 0.9, yDist)

      if (yAlpha > 0) {
        const yTone = clamp01((194 - py) / 130)
        const yr = 232 + yTone * 16
        const yg = 170 + yTone * 38
        const yb = 120 + yTone * 54
        r = r * (1 - yAlpha) + yr * yAlpha
        g = g * (1 - yAlpha) + yg * yAlpha
        b = b * (1 - yAlpha) + yb * yAlpha
      }

      const sx = Math.abs(px - 188) / 24
      const sy = Math.abs(py - 66) / 24
      const starField = Math.pow(Math.max(sx, 1e-4), 0.58) + Math.pow(Math.max(sy, 1e-4), 0.58)
      const starAlpha = 1 - smoothstep(0.92, 1.04, starField)
      if (starAlpha > 0) {
        r = r * (1 - starAlpha) + 255 * starAlpha
        g = g * (1 - starAlpha) + 234 * starAlpha
        b = b * (1 - starAlpha) + 204 * starAlpha
      }

      const idx = rowOffset + 1 + x * 4
      raw[idx] = Math.round(Math.min(255, Math.max(0, r)))
      raw[idx + 1] = Math.round(Math.min(255, Math.max(0, g)))
      raw[idx + 2] = Math.round(Math.min(255, Math.max(0, b)))
      raw[idx + 3] = Math.round(bgAlpha * 255)
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function writeOctal(buf, value, offset, length) {
  const oct = value.toString(8).padStart(length - 1, '0')
  buf.write(oct, offset, length - 1, 'ascii')
  buf[offset + length - 1] = 0
}

export function buildNpmTgzBuffer(entries) {
  const blocks = []
  const fixedMtime = 1767225600 // 2026-01-01T00:00:00Z

  for (const item of entries) {
    const tarName = `package/${item.name.replace(/\\/g, '/')}`
    const nameBytes = Buffer.from(tarName, 'utf8')
    if (nameBytes.length > 100) {
      throw new Error(`Tar entry name exceeds 100 bytes: ${tarName}`)
    }
    const content = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data)

    const header = Buffer.alloc(512)
    nameBytes.copy(header, 0)
    writeOctal(header, 0o644, 100, 8)
    writeOctal(header, 0, 108, 8)
    writeOctal(header, 0, 116, 8)
    writeOctal(header, content.length, 124, 12)
    writeOctal(header, fixedMtime, 136, 12)
    header.fill(0x20, 148, 156)
    header[156] = 0x30
    header.write('ustar\0', 257, 6, 'ascii')
    header.write('00', 263, 2, 'ascii')

    let sum = 0
    for (let i = 0; i < 512; i += 1) sum += header[i]
    const chk = sum.toString(8).padStart(6, '0')
    header.write(chk, 148, 6, 'ascii')
    header[154] = 0
    header[155] = 0x20

    blocks.push(header)
    blocks.push(content)
    const remainder = content.length % 512
    if (remainder !== 0) {
      blocks.push(Buffer.alloc(512 - remainder))
    }
  }

  blocks.push(Buffer.alloc(1024))
  const tarBuf = Buffer.concat(blocks)
  const gz = gzipSync(tarBuf, { level: 9 })
  gz.writeUInt32LE(0, 4)
  gz[9] = 3
  return gz
}

export function verifyDshTgzBuffer(tgzBuf) {
  const tarBuf = gunzipSync(tgzBuf)
  if (tarBuf.length % 512 !== 0) {
    throw new Error('Uncompressed tar buffer is not 512-byte aligned')
  }
  const files = new Map()
  let offset = 0
  while (offset + 512 <= tarBuf.length) {
    const header = tarBuf.subarray(offset, offset + 512)
    if (header.every((b) => b === 0)) break
    const magic = header.subarray(257, 262).toString('ascii')
    if (magic !== 'ustar') {
      throw new Error(`Invalid ustar magic at offset ${offset}: ${JSON.stringify(magic)}`)
    }
    const nameEnd = header.subarray(0, 100).indexOf(0)
    const name = header.subarray(0, nameEnd < 0 ? 100 : nameEnd).toString('utf8')
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim()
    const size = Number.parseInt(sizeText, 8)
    offset += 512
    const body = Buffer.from(tarBuf.subarray(offset, offset + size))
    files.set(name, body)
    offset += Math.ceil(size / 512) * 512
  }
  return files
}

export function loadDshTsModuleForTest(entryRelId, externals = {}) {
  const allModules = Array.from(new Set([...HOST_MODULES, ...CLIENT_MODULES]))
  const registrySource = buildModuleRegistrySource(allModules, true)
  const runner = new Function(
    'outerRequire',
    `${registrySource}\nreturn __load(${JSON.stringify(entryRelId)}, outerRequire);`,
  )
  return runner((specifier) => {
    if (Object.prototype.hasOwnProperty.call(externals, specifier)) {
      return externals[specifier]
    }
    throw new Error(`Unmocked external module in test: ${specifier}`)
  })
}

export function buildDshPlugin({ outFile } = {}) {
  typecheckDshPlugin()

  const pkg = JSON.parse(readFileSync(path.join(PLUGIN_DIR, 'package.json'), 'utf8'))
  mkdirSync(LIB_DIR, { recursive: true })

  writeFileSync(path.join(LIB_DIR, 'index.js'), buildHostBundle(), 'utf8')
  writeFileSync(path.join(LIB_DIR, 'index.d.ts'), buildHostTypes(), 'utf8')
  writeFileSync(path.join(LIB_DIR, 'client.js'), buildClientBundle(pkg.name), 'utf8')
  writeFileSync(path.join(PLUGIN_DIR, 'icon.png'), generateIconPng(256))

  const entries = TARBALL_FILES.map((name) => ({
    name,
    data: readFileSync(path.join(PLUGIN_DIR, name)),
  }))
  const tgzBuf = buildNpmTgzBuffer(entries)
  const verified = verifyDshTgzBuffer(tgzBuf)
  if (!verified.has('package/package.json') || !verified.has('package/lib/client.js')) {
    throw new Error('Tarball verification failed: missing required package entries')
  }

  if (outFile) {
    mkdirSync(path.dirname(outFile), { recursive: true })
    writeFileSync(outFile, tgzBuf)
  }

  const sha256 = createHash('sha256').update(tgzBuf).digest('hex')
  return {
    outFile: outFile ?? null,
    tgzBuf,
    name: pkg.name,
    version: pkg.version,
    size: tgzBuf.length,
    sha256,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tgzIdx = process.argv.indexOf('--tgz')
  const outFile = tgzIdx >= 0 && process.argv[tgzIdx + 1]
    ? path.resolve(process.argv[tgzIdx + 1])
    : undefined
  const info = buildDshPlugin({ outFile })
  const target = info.outFile ? path.relative(process.cwd(), info.outFile) : 'lib/index.js + lib/client.js'
  console.log(
    `Built ${target} (${info.name}@${info.version}, ${info.size} bytes tgz, sha256=${info.sha256})`,
  )
}
