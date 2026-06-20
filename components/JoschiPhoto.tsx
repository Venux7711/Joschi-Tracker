'use client'

import { useState } from 'react'
import Image from 'next/image'

export default function JoschiPhoto({ size = 20 }: { size?: number }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`relative w-${size} h-${size} rounded-full overflow-hidden border-4 border-white/60 shadow-lg flex-shrink-0 cursor-zoom-in`}
        aria-label="Joschi Foto vergrößern"
      >
        <Image src="/joschi.jpg" alt="Joschi" fill className="object-cover object-top" priority />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden shadow-2xl">
            <Image src="/joschi.jpg" alt="Joschi" fill className="object-cover object-top" />
          </div>
          <button
            className="absolute top-5 right-5 text-white text-3xl font-light leading-none"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
