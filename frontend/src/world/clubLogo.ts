export const CLUB_LOGO_URL = '/images/club-logo.svg'

let cached: Promise<HTMLImageElement | null> | undefined

export function loadClubLogo(): Promise<HTMLImageElement | null> {
  cached ??= new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = CLUB_LOGO_URL
  })
  return cached
}

export function drawClubLogo(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  size: number,
) {
  const w0 = img.naturalWidth || img.width
  const h0 = img.naturalHeight || img.height
  const scale = size / Math.max(w0, h0)
  const w = w0 * scale
  const h = h0 * scale
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
}
