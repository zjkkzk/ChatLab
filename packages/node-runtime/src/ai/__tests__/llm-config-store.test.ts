import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { LLMConfigStore, type ConfigStorage, type AIConfigStore } from '../llm-config-store'

function createMemoryStorage(): ConfigStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return {
    data,
    readJson<T>(key: string): T | null {
      return (data.get(key) as T) ?? null
    },
    writeJson<T>(key: string, value: T): void {
      data.set(key, JSON.parse(JSON.stringify(value)))
    },
  }
}

describe('LLMConfigStore', () => {
  let storage: ReturnType<typeof createMemoryStorage>
  let store: LLMConfigStore
  let idCounter: number

  beforeEach(() => {
    storage = createMemoryStorage()
    idCounter = 0
    store = new LLMConfigStore(storage, {
      generateId: () => `id-${++idCounter}`,
    })
  })

  it('returns empty store when no data', () => {
    const all = store.getAllConfigs()
    assert.equal(all.length, 0)
    assert.equal(store.hasActiveConfig(), false)
  })

  it('adds a config', () => {
    const result = store.addConfig({
      name: 'Test',
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4',
    })
    assert.ok(result.success)
    assert.equal(result.config!.id, 'id-1')
    assert.equal(result.config!.name, 'Test')
    assert.equal(store.getAllConfigs().length, 1)
  })

  it('sets first config as default assistant', () => {
    store.addConfig({ name: 'A', provider: 'openai', apiKey: 'k', model: 'gpt-4' })
    const slot = store.getDefaultAssistantSlot()
    assert.ok(slot)
    assert.equal(slot!.configId, 'id-1')
    assert.equal(slot!.modelId, 'gpt-4')
  })

  it('updates a config', () => {
    store.addConfig({ name: 'Old', provider: 'openai', apiKey: 'k' })
    const result = store.updateConfig('id-1', { name: 'New' })
    assert.ok(result.success)
    const config = store.getConfigById('id-1')
    assert.equal(config!.name, 'New')
  })

  it('returns error when updating non-existent config', () => {
    const result = store.updateConfig('nope', { name: 'X' })
    assert.equal(result.success, false)
    assert.ok(result.error)
  })

  it('deletes a config', () => {
    store.addConfig({ name: 'A', provider: 'openai', apiKey: 'k' })
    store.addConfig({ name: 'B', provider: 'openai', apiKey: 'k' })
    const result = store.deleteConfig('id-1')
    assert.ok(result.success)
    assert.equal(store.getAllConfigs().length, 1)
  })

  it('reassigns default assistant after deleting current default', () => {
    store.addConfig({ name: 'A', provider: 'openai', apiKey: 'k', model: 'gpt-4' })
    store.addConfig({ name: 'B', provider: 'openai', apiKey: 'k', model: 'gpt-3' })
    store.deleteConfig('id-1')
    const slot = store.getDefaultAssistantSlot()
    assert.equal(slot!.configId, 'id-2')
  })

  it('sets and retrieves fast model', () => {
    store.addConfig({ name: 'A', provider: 'openai', apiKey: 'k', model: 'gpt-4' })
    store.setFastModel({ configId: 'id-1', modelId: 'gpt-3.5' })
    const config = store.getFastModelConfig()
    assert.ok(config)
    assert.equal(config!.model, 'gpt-3.5')
  })

  it('fast model falls back to default when null', () => {
    store.addConfig({ name: 'A', provider: 'openai', apiKey: 'k', model: 'gpt-4' })
    store.setFastModel(null)
    const config = store.getFastModelConfig()
    assert.ok(config)
    assert.equal(config!.model, 'gpt-4')
  })

  it('strips apiKey when saving', () => {
    store.addConfig({ name: 'A', provider: 'openai', apiKey: 'secret' })
    const raw = storage.data.get('llm-config') as AIConfigStore
    assert.equal(raw.configs[0].apiKey, '')
  })

  it('respects MAX_CONFIG_COUNT', () => {
    for (let i = 0; i < 99; i++) {
      store.addConfig({ name: `C${i}`, provider: 'openai', apiKey: 'k' })
    }
    const result = store.addConfig({ name: 'Overflow', provider: 'openai', apiKey: 'k' })
    assert.equal(result.success, false)
    assert.ok(result.error)
  })

  it('calls onApiKeyCreated when adding config with key', () => {
    const captured: Array<{ name: string; key: string }> = []
    const storeWithHook = new LLMConfigStore(storage, {
      generateId: () => `id-${++idCounter}`,
      onApiKeyCreated: (config, apiKey) => {
        captured.push({ name: config.name, key: apiKey })
      },
    })
    storeWithHook.addConfig({ name: 'Hooked', provider: 'openai', apiKey: 'my-key' })
    assert.equal(captured.length, 1)
    assert.equal(captured[0].name, 'Hooked')
    assert.equal(captured[0].key, 'my-key')
  })
})
