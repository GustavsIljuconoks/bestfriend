import { safeStorage, app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const SAFE_STORAGE_FILE = (): string => join(app.getPath('userData'), 'safe-keys.enc.json')

interface EncryptedKeyStore {
  openai?: string   // base64-encoded encrypted ciphertext
  pinecone?: string // base64-encoded encrypted ciphertext
}

function readStore(): EncryptedKeyStore {
  try {
    const file = SAFE_STORAGE_FILE()
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf8')) as EncryptedKeyStore
    }
  } catch {
    // ignore — return empty store
  }
  return {}
}

function writeStore(store: EncryptedKeyStore): void {
  writeFileSync(SAFE_STORAGE_FILE(), JSON.stringify(store), 'utf8')
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function storeKey(keyName: 'openai' | 'pinecone', plaintext: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Secure storage is not available on this system. Cannot store API keys. ' +
        'Ensure you are running macOS with Keychain access enabled.',
    )
  }
  const encrypted = safeStorage.encryptString(plaintext)
  const store = readStore()
  store[keyName] = encrypted.toString('base64')
  writeStore(store)
}

export function retrieveKey(keyName: 'openai' | 'pinecone'): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const store = readStore()
  const encoded = store[keyName]
  if (!encoded) return null
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  } catch {
    return null
  }
}

export function isKeySet(keyName: 'openai' | 'pinecone'): boolean {
  const store = readStore()
  return !!store[keyName]
}

export function clearKey(keyName: 'openai' | 'pinecone'): void {
  const store = readStore()
  delete store[keyName]
  writeStore(store)
}
