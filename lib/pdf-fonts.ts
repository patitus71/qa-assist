// lib/pdf-fonts.ts
// Call registerPdfFonts() before pdf() — safe to call multiple times.

let registered = false

export async function registerPdfFonts(): Promise<void> {
  if (registered) return
  registered = true

  // Suppress MaxListenersExceeded warnings from @react-pdf/renderer internals
  if (typeof process !== 'undefined' && typeof process.setMaxListeners === 'function') {
    process.setMaxListeners(20)
  }

  const { Font } = await import('@react-pdf/renderer')
  Font.register({
    family: 'Sarabun',
    fonts: [
      {
        src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVmJx26TKEr37c9YL5.ttf',
        fontWeight: 'normal',
      },
      {
        src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVjJx26TKEr37c9aApf.ttf',
        fontWeight: 'bold',
      },
    ],
  })
}
