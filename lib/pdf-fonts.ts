// lib/pdf-fonts.ts
// Call registerPdfFonts() before pdf() — safe to call multiple times.

let registered = false

export async function registerPdfFonts(): Promise<void> {
  if (registered) return
  registered = true
  const { Font } = await import('@react-pdf/renderer')
  Font.register({
    family: 'THSarabunNew',
    fonts: [
      { src: '/fonts/THSarabunNew.ttf', fontWeight: 'normal' },
      { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' },
    ],
  })
}
