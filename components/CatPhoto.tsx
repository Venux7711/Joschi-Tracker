'use client'

import { useState } from 'react'
import Image from 'next/image'
import { getCatTheme } from '@/lib/cat-theme'
import type { CatTheme } from '@/lib/types'

export default function CatPhoto({
  src, name, theme, size = 80,
}: {
  src: string | null
  name: string
  theme: CatTheme
  size?: number
}) {
  const [open, setOpen] = useState(false)
  const [errored, setErrored] = useState(false)
  const showPhoto = src && !errored

  const fallback = (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: getCatTheme(theme).photoGradient, fontSize: size * 0.42 }}
    >
      🐾
    </div>
  )

  return (
    <>
      <button
        onClick={() => showPhoto && setOpen(true)}
        style={{ width: size, height: size, cursor: showPhoto ? 'zoom-in' : 'default' }}
        className="relative rounded-full overflow-hidden border-4 border-white/60 shadow-lg flex-shrink-0"
        aria-label={`${name} Foto vergrößern`}
      >
        {showPhoto
          ? <Image src={src} alt={name} fill className="object-cover object-top" priority onError={() => setErrored(true)} />
          : fallback}
      </button>

      {open && showPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setOpen(false)}
        >
          <div className="relative w-full max-w-xs aspect-square rounded-3xl overflow-hidden shadow-2xl">
            <Image src={src} alt={name} fill className="object-cover object-top" />
          </div>
          <button
            className="absolute top-5 right-5 text-white text-4xl font-thin leading-none"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
      )}
    </>
  )
}
