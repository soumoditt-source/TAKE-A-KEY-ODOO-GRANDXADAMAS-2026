'use client';

import Spline from '@splinetool/react-spline';
import { motion } from 'framer-motion';

export default function IntroScreen({ onOpen }: { onOpen: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#050505] overflow-hidden"
    >
      {/* Spline 3D Scene */}
      <div className="absolute inset-0 z-0">
        <Spline scene="https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode" />
      </div>

      {/* Subtle overlay gradient to ensure text readability */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />

      {/* Foreground UI Overlay */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-between pointer-events-none p-8 sm:p-12">
        
        {/* Top Section - App Title */}
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
          className="mt-10 flex flex-col items-center text-center"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-black font-extrabold text-xl shadow-[0_0_40px_rgba(255,255,255,0.15)]">
              TK
            </span>
            <h1 className="text-3xl font-extrabold tracking-[0.15em] text-white uppercase sm:text-4xl drop-shadow-2xl">
              Take-A-Key
            </h1>
          </div>
          <p className="mt-4 text-xs font-semibold tracking-[0.25em] text-white/50 uppercase">
            Mobility Control Room
          </p>
        </motion.div>

        {/* Bottom Section - Tap to Open */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 1, ease: "easeOut" }}
          className="mb-12 pointer-events-auto"
        >
          <button
            onClick={onOpen}
            className="group relative flex items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 px-10 py-4 text-xs font-bold tracking-[0.2em] text-white backdrop-blur-xl transition-all hover:bg-white/10 hover:scale-105 hover:border-white/20 active:scale-95 shadow-[0_0_40px_rgba(0,0,0,0.5)]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-sky-400/0 via-sky-400/10 to-sky-400/0 opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
            <span className="mr-4 flex h-2 w-2">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500"></span>
            </span>
            TAP TO OPEN
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
