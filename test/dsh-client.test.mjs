import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadDshTsModuleForTest } from '../scripts/build.mjs'

const require = createRequire(import.meta.url)
const React = require('react')
const jsxRuntime = require('react/jsx-runtime')
const { renderToStaticMarkup } = require('react-dom/server')

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_DIR = path.resolve(TEST_DIR, '..')

const wandMod = loadDshTsModuleForTest('client/wand-button.tsx', {
  react: React,
  'react/jsx-runtime': jsxRuntime,
})
const restoreMod = loadDshTsModuleForTest('client/restore-store.ts')
const localesMod = loadDshTsModuleForTest('client/locales.ts')

test('lib/client.js loads via window.__ModuleLoader__.load and registers locales, styles, and composer slot', () => {
  const clientCode = readFileSync(path.join(PLUGIN_DIR, 'lib', 'client.js'), 'utf8')
  let loadedPayload = null
  const appendedStyles = []

  const fakeDocument = {
    head: {
      appendChild(el) {
        appendedStyles.push(el)
      },
    },
    querySelector(sel) {
      if (sel === 'style[data-plugin="dsh-yce"]') {
        return appendedStyles.find((el) => el.dataset.plugin === 'dsh-yce') ?? null
      }
      return null
    },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        dataset: {},
        textContent: '',
        removed: false,
        remove() {
          this.removed = true
        },
      }
    },
  }

  const fakeWindow = {
    setTimeout,
    clearTimeout,
    __ModuleLoader__: {
      load(payload) {
        loadedPayload = payload
      },
    },
  }

  new Function('window', 'document', clientCode)(fakeWindow, fakeDocument)
  assert.ok(loadedPayload, 'window.__ModuleLoader__.load was not invoked')
  assert.equal(loadedPayload.id, 'dsh-yce')
  assert.equal(typeof loadedPayload.factory, 'function')

  const requestedExternals = []
  const clientPlugin = loadedPayload.factory((specifier) => {
    requestedExternals.push(specifier)
    if (specifier === 'react') return React
    if (specifier === 'react/jsx-runtime') return jsxRuntime
    throw new Error(`Unexpected browser require: ${specifier}`)
  })

  // Only react & react/jsx-runtime may ever be requested from host browser loader
  assert.ok(requestedExternals.every((s) => s === 'react' || s === 'react/jsx-runtime'))
  assert.deepEqual(clientPlugin.inject, ['slots', 'locale', 'connection'])
  assert.equal(typeof clientPlugin.apply, 'function')

  const disposers = []
  let registeredLocale = null
  let registeredSlot = null

  const ctx = {
    get() {
      return undefined
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    locale: {
      register(ns, dicts) {
        registeredLocale = { ns, dicts }
        return () => {}
      },
    },
    slots: {
      inject(slotName, fn) {
        assert.equal(slotName, 'conversation.input.left')
        const dispose = fn()
        if (typeof dispose === 'function') disposers.push(dispose)
      },
      register(meta, renderFn) {
        registeredSlot = { meta, renderFn }
        return () => {}
      },
    },
  }

  clientPlugin.apply(ctx)

  assert.equal(registeredLocale?.ns, 'settings.dshYce')
  assert.equal(typeof registeredLocale?.dicts?.zh['wand.label'], 'string')
  assert.equal(typeof registeredLocale?.dicts?.en['wand.label'], 'string')
  assert.equal(appendedStyles.length, 1)
  assert.equal(appendedStyles[0].dataset.plugin, 'dsh-yce')
  assert.match(appendedStyles[0].textContent, /\.dshyce-btn/)

  assert.deepEqual(registeredSlot?.meta, {
    name: 'conversation.input.left',
    id: 'dsh-yce',
    order: -40,
    locale: 'settings.dshYce',
  })

  const html = renderToStaticMarkup(
    registeredSlot.renderFn({
      t: (key) => localesMod.zh[key],
      input: { draft: '帮我重构登录鉴权模块' },
      inputActions: { setDraft() {} },
    }),
  )
  assert.match(html, /class="dshyce-wrap"/)
  assert.match(html, /class="dshyce-btn"/)
  assert.match(html, /aria-label="用 YCE 增强提示词"/)
  assert.doesNotMatch(html, /disabled=""/)

  // Empty draft disables the button
  const emptyHtml = renderToStaticMarkup(
    registeredSlot.renderFn({
      t: (key) => localesMod.zh[key],
      input: { draft: '   ' },
      inputActions: { setDraft() {} },
    }),
  )
  assert.match(emptyHtml, /data-empty="true"/)
  assert.match(emptyHtml, /disabled=""/)

  for (const dispose of disposers) dispose()
  assert.equal(appendedStyles[0].removed, true)
})

test('parseEnhanceResult, messageFor, and restore-store handle RPC envelopes and undo state', () => {
  assert.deepEqual(
    wandMod.parseEnhanceResult({
      result: { ok: true, value: { text: 'rewritten prompt' } },
    }),
    { ok: true, value: { text: 'rewritten prompt' } },
  )

  assert.deepEqual(
    wandMod.parseEnhanceResult({
      ok: false,
      error: {
        code: 'internal',
        message: 'wrapped error',
        details: { code: 'auth_error' },
      },
    }),
    {
      ok: false,
      error: { code: 'auth_error', message: 'wrapped error', details: {} },
    },
  )

  const tZh = (key) => localesMod.zh[key]
  assert.match(wandMod.messageFor('mcp_missing', tZh), /yce-mcp/)
  assert.match(wandMod.messageFor('mcp_missing', tZh), /cordis\.patch\.yml/)
  assert.match(wandMod.messageFor('mcp_missing', tZh), /yce\.aigy\.de\/console/)
  assert.match(wandMod.messageFor('auth_error', tZh), /YCE_RELAY_TOKEN/)
  assert.match(wandMod.messageFor('quota_exceeded', tZh), /额度/)

  assert.equal(wandMod.needsMcpSetupHelp('mcp_missing'), true)
  assert.equal(wandMod.needsMcpSetupHelp('auth_error'), true)
  assert.equal(wandMod.needsMcpSetupHelp('cli_missing'), true)
  assert.equal(wandMod.needsMcpSetupHelp('quota_exceeded'), false)

  const dshSnippet = localesMod.buildDshMcpSnippet(true)
  assert.match(dshSnippet, /@deepseek-ai\/dsh-mcp/)
  assert.match(dshSnippet, /yce-mcp@latest/)
  assert.match(dshSnippet, /YCE_RELAY_TOKEN/)
  assert.match(dshSnippet, /yce\.aigy\.de\/console/)

  let notifications = 0
  const unsub = restoreMod.subscribeRestore(() => {
    notifications += 1
  })
  restoreMod.setRestore({ sessionId: 's1', original: 'raw', enhanced: 'better' })
  assert.deepEqual(restoreMod.getRestore(), {
    sessionId: 's1',
    original: 'raw',
    enhanced: 'better',
  })
  restoreMod.setRestore(undefined)
  assert.equal(restoreMod.getRestore(), undefined)
  assert.equal(notifications, 2)
  unsub()
})
