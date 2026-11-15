'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signInWithGoogle } from '@/lib/auth';

export function LandingNav() {
  return (
    <nav aria-label="Main navigation" className="w-full border-b border-white/10 px-4 py-4 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        {/* Brand */}
        <Link
          href="/"
          className="font-serif text-2xl font-semibold tracking-wide text-[#f5efe3] hover:opacity-90"
        >
          FlashForge
        </Link>

        {/* Navigation links & actions */}
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/guide"
            className="text-sm font-medium text-[#f5efe3]/80 hover:text-white transition"
          >
            Guide
          </Link>

          {/* Privacy button beside Sign in on its left side */}
          <Link
            href="/privacy"
            className="text-sm font-medium text-[#f5efe3]/80 hover:text-white transition"
          >
            Privacy
          </Link>

          <Link
            href="/sign-in"
            className="text-sm font-medium text-[#f5efe3]/90 hover:text-white transition cursor-pointer"
          >
            Sign In
          </Link>

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-[#b88c3e] bg-[#cca152] px-4 py-2 text-sm font-bold text-[#261a0e] shadow-[0_3px_0_#9a7231,0_4px_8px_rgba(0,0,0,0.15)] hover:bg-[#bf9442] active:translate-y-[2px] active:shadow-none transition cursor-pointer"
          >
            Get Started
          </button>
        </div>
      </div>
    </nav>
  );
}

export function FlippingCard() {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div
      onClick={() => setIsFlipped((prev) => !prev)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsFlipped((prev) => !prev);
        }
      }}
      aria-label="Interactive sample flashcard. Click to flip"
      className="group relative w-full max-w-[360px] sm:max-w-[420px] cursor-pointer select-none"
      style={{ perspective: '1000px' }}
    >
      {/* Background card to produce stacked physical deck depth */}
      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-3 translate-y-3.5 -rotate-2 rounded-2xl border border-[#ded3c2] bg-[#f0e7d8] shadow-lg opacity-85 transition-transform duration-300 group-hover:translate-x-4 group-hover:translate-y-4"
      />

      {/* 3D Flip Card */}
      <div
        className="relative min-h-[220px] w-full rounded-2xl transition-transform duration-500 ease-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotate(2.5deg) rotateY(180deg)' : 'rotate(2.5deg) rotateY(0deg)',
        }}
      >
        {/* Front Face (1st Photo) */}
        <div
          className="absolute inset-0 flex flex-col justify-between rounded-2xl border border-[#e2d5c3] bg-[#fcf8f0] p-6 shadow-2xl sm:p-7"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#ad8539] sm:text-xs">
              GENETICS
            </span>
            <p className="mt-3 font-serif text-lg font-bold leading-snug text-[#1f1914] sm:text-[22px]">
              Which molecule carries genetic information?
            </p>
          </div>
          <p className="mt-6 text-xs text-[#786f63]">
            Tap to flip card · Card 2 / 12
          </p>
        </div>

        {/* Back Face (2nd Photo) */}
        <div
          className="absolute inset-0 flex flex-col justify-between rounded-2xl border border-[#3d3228] bg-[#201813] p-6 shadow-2xl sm:p-7"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#cca152] sm:text-xs">
              ANSWER
            </span>
            <p className="mt-3 font-serif text-3xl font-bold tracking-wide text-[#f5efe3] sm:text-4xl">
              DNA
            </p>
          </div>
          <p className="mt-6 text-xs text-[#b8ab9b]">
            Got it? On to the next card →
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LandingHero() {
  return (
    <section aria-label="Hero section" className="w-full px-4 pt-10 pb-12 sm:px-8 sm:pt-16 sm:pb-16">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-8">
        {/* Left Column Content */}
        <div className="flex flex-col items-start lg:col-span-7">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#d6c7b5]/30 bg-[#fbf8f0]/10 px-3.5 py-1 text-xs font-semibold tracking-wider text-[#e8dfcf] uppercase backdrop-blur-sm">
            <span className="text-[#cca152]">✦</span> AI-POWERED STUDY ENGINE
          </div>

          <h1 className="mt-5 font-serif text-4xl font-normal leading-[1.12] tracking-tight text-[#f5efe3] sm:text-5xl lg:text-[54px]">
            Transform raw notes<br />
            into interactive<br />
            <span className="font-serif text-[#cca152]">mastery decks.</span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#f5efe3]/80 sm:text-lg">
            Upload PDFs, textbook chapters, or lecture notes. FlashForge automatically generates smart flashcards, multiple-choice quizzes, and spatial matching challenges.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-[#b88c3e] bg-[#cca152] px-6 py-3 text-[15px] font-bold text-[#261a0e] shadow-[0_4px_0_#9a7231,0_6px_10px_rgba(0,0,0,0.15)] hover:bg-[#bf9442] active:translate-y-[2px] active:shadow-none transition cursor-pointer"
            >
              Start Learning →
            </button>
          </div>
        </div>

        {/* Right Column 3D Flipping Flashcard */}
        <div className="flex justify-center lg:col-span-5 lg:justify-end">
          <FlippingCard />
        </div>
      </div>
    </section>
  );
}
