import type { jsPDF } from 'jspdf'
// Google Fonts (OFL), as static TTFs. Vite emits each as its own asset, fetched only when used.
import playfairR from '@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf?url'
import playfairB from '@expo-google-fonts/playfair-display/600SemiBold/PlayfairDisplay_600SemiBold.ttf?url'
import cormorantR from '@expo-google-fonts/cormorant-garamond/400Regular/CormorantGaramond_400Regular.ttf?url'
import cormorantB from '@expo-google-fonts/cormorant-garamond/600SemiBold/CormorantGaramond_600SemiBold.ttf?url'
import loraR from '@expo-google-fonts/lora/400Regular/Lora_400Regular.ttf?url'
import loraB from '@expo-google-fonts/lora/600SemiBold/Lora_600SemiBold.ttf?url'
import montserratR from '@expo-google-fonts/montserrat/400Regular/Montserrat_400Regular.ttf?url'
import montserratB from '@expo-google-fonts/montserrat/600SemiBold/Montserrat_600SemiBold.ttf?url'
import josefinR from '@expo-google-fonts/josefin-sans/400Regular/JosefinSans_400Regular.ttf?url'
import josefinB from '@expo-google-fonts/josefin-sans/600SemiBold/JosefinSans_600SemiBold.ttf?url'
import interR from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf?url'
import interB from '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf?url'
import vibesR from '@expo-google-fonts/great-vibes/400Regular/GreatVibes_400Regular.ttf?url'
import dancingR from '@expo-google-fonts/dancing-script/400Regular/DancingScript_400Regular.ttf?url'
import dancingB from '@expo-google-fonts/dancing-script/600SemiBold/DancingScript_600SemiBold.ttf?url'

export type FontKey = 'playfair' | 'cormorant' | 'lora' | 'montserrat' | 'josefin' | 'inter' | 'greatvibes' | 'dancing'

interface FontDef {
  label: string
  kind: 'serif' | 'sans' | 'script'
  regular: string
  bold: string
  /** Scripts read small at the same point size, so they're drawn larger. */
  scale: number
}

export const FONTS: Record<FontKey, FontDef> = {
  playfair: { label: 'Playfair Display', kind: 'serif', regular: playfairR, bold: playfairB, scale: 1 },
  cormorant: { label: 'Cormorant Garamond', kind: 'serif', regular: cormorantR, bold: cormorantB, scale: 1.12 },
  lora: { label: 'Lora', kind: 'serif', regular: loraR, bold: loraB, scale: 1 },
  montserrat: { label: 'Montserrat', kind: 'sans', regular: montserratR, bold: montserratB, scale: 0.95 },
  josefin: { label: 'Josefin Sans', kind: 'sans', regular: josefinR, bold: josefinB, scale: 1.05 },
  inter: { label: 'Inter', kind: 'sans', regular: interR, bold: interB, scale: 0.95 },
  greatvibes: { label: 'Great Vibes', kind: 'script', regular: vibesR, bold: vibesR, scale: 1.45 },
  dancing: { label: 'Dancing Script', kind: 'script', regular: dancingR, bold: dancingB, scale: 1.2 },
}

export const FONT_KEYS = Object.keys(FONTS) as FontKey[]
export const isFont = (k: string): k is FontKey => k in FONTS

/** Heading + names pairings. Scripts only ever head the page — they're hard to scan in a list. */
export const STYLES: { id: string; label: string; heading: FontKey; body: FontKey; accent: string }[] = [
  { id: 'classic', label: 'Classic', heading: 'playfair', body: 'lora', accent: '#8a6d3b' },
  { id: 'romantic', label: 'Romantic', heading: 'greatvibes', body: 'cormorant', accent: '#9d5c6f' },
  { id: 'modern', label: 'Modern', heading: 'montserrat', body: 'montserrat', accent: '#1e293b' },
  { id: 'minimal', label: 'Minimal', heading: 'inter', body: 'inter', accent: '#475569' },
  { id: 'deco', label: 'Art deco', heading: 'josefin', body: 'josefin', accent: '#a07d2c' },
  { id: 'garden', label: 'Garden', heading: 'dancing', body: 'lora', accent: '#4d7c5a' },
]

const bytes = new Map<string, Promise<string>>()

const base64 = (url: string) => {
  let hit = bytes.get(url)
  if (!hit) {
    hit = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Font ${url} ${r.status}`)
        return r.arrayBuffer()
      })
      .then((buf) => {
        const u8 = new Uint8Array(buf)
        let s = ''
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
        return btoa(s)
      })
    hit.catch(() => bytes.delete(url))
    bytes.set(url, hit)
  }
  return hit
}

/** Embed fonts into a jsPDF document, registered under their key with 'normal' and 'bold' styles. */
export const embedFonts = async (p: jsPDF, keys: FontKey[]) => {
  for (const k of new Set(keys)) {
    const f = FONTS[k]
    const [r, b] = await Promise.all([base64(f.regular), base64(f.bold)])
    p.addFileToVFS(`${k}-normal.ttf`, r)
    p.addFont(`${k}-normal.ttf`, k, 'normal')
    p.addFileToVFS(`${k}-bold.ttf`, b)
    p.addFont(`${k}-bold.ttf`, k, 'bold')
  }
}

/** CSS family name for previews in the UI. */
export const cssFamily = (k: FontKey) => `plotline-${k}`

const faces = new Set<FontKey>()
/** Register fonts as CSS FontFaces so pickers can show each option in its own face. */
export const loadCssFonts = (keys: FontKey[]) =>
  Promise.all(
    keys
      .filter((k) => !faces.has(k))
      .map(async (k) => {
        faces.add(k)
        try {
          const face = new FontFace(cssFamily(k), `url(${FONTS[k].regular})`)
          document.fonts.add(await face.load())
        } catch {
          faces.delete(k)
        }
      }),
  )
