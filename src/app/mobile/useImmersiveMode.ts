import { useEffect } from 'react'

export function setImmersiveReading(enabled: boolean): void {
  try {
    const bridge = (
      window as unknown as {
        CartaAndroidBridge?: { setImmersiveReading?: (enabled: boolean) => void }
      }
    ).CartaAndroidBridge
    bridge?.setImmersiveReading?.(enabled)
  } catch {
    // Unsupported or bridge not present
  }
}

export function useImmersiveMode(enabled: boolean): void {
  useEffect(() => {
    const restore = () => {
      if (document.visibilityState !== 'hidden') setImmersiveReading(enabled)
    }
    setImmersiveReading(enabled)
    window.addEventListener('focus', restore)
    document.addEventListener('visibilitychange', restore)
    return () => {
      window.removeEventListener('focus', restore)
      document.removeEventListener('visibilitychange', restore)
      setImmersiveReading(false)
    }
  }, [enabled])
}
