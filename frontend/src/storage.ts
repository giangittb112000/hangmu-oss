export function loadLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function saveLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

export function loadSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export function saveSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value)
  } catch {}
}
