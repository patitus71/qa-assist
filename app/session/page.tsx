// app/session/page.tsx
import { redirect } from 'next/navigation'

export default function SessionIndex() {
  redirect('/session/generate')
}
