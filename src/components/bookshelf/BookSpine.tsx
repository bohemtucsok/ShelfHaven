"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { blurHashToDataURL } from "@/lib/blurhash-to-url";

interface BookSpineProps {
  id: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  blurHash?: string | null;
  color?: string;
  format?: string;
  progress?: number;
  className?: string;
}

export default function BookSpine({ id, title, author, coverUrl, blurHash, color = "#8B4513", format, progress, className = "" }: BookSpineProps) {
  const [isHovered, setIsHovered] = useState(false);
  const blurDataURL = useMemo(() => (blurHash ? blurHashToDataURL(blurHash) : undefined), [blurHash]);

  // Generate spine width based on title length (simulate book thickness)
  const spineWidth = Math.max(36, Math.min(56, title.length * 1.5 + 30));

  return (
    <Link href={`/book/${id}`} className={`relative inline-block ${className}`} style={{ zIndex: isHovered ? 40 : 0 }}>
      <motion.div
        className="relative cursor-pointer"
        style={{ perspective: "800px" }}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
      >
        {/* Book spine */}
        <motion.div
          className="relative flex items-center justify-center rounded-sm shadow-md"
          style={{
            width: `${spineWidth}px`,
            height: "200px",
            backgroundColor: color,
            transformStyle: "preserve-3d",
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
          animate={{
            rotateY: isHovered ? -20 : -5,
            translateZ: isHovered ? 20 : 0,
            scale: isHovered ? 1.15 : 1,
            y: isHovered ? -15 : 0,
          }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          {/* Spine edge highlight */}
          <div
            className="absolute inset-y-0 left-0 w-[3px] rounded-l-sm"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          />

          {/* Title on spine (vertical) */}
          <span
            className="absolute text-xs font-semibold text-white/90 select-none"
            style={{
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              maxHeight: "180px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              letterSpacing: "0.5px",
              textShadow: "0 1px 2px rgba(0,0,0,0.3)",
            }}
          >
            {title}
          </span>

          {/* Spine shadow/depth effect */}
          <div
            className="absolute inset-y-0 right-0 w-[2px]"
            style={{ backgroundColor: "rgba(0,0,0,0.2)" }}
          />

          {/* Reading progress fill (green, from bottom) */}
          {progress !== undefined && progress > 0 && (
            <div
              className="absolute bottom-0 left-0 right-0 rounded-b-sm bg-green-400/25"
              style={{ height: `${Math.min(progress, 100)}%` }}
            />
          )}
        </motion.div>

        {/* Hover tooltip/card */}
        <motion.div
          className="pointer-events-none absolute bottom-16 left-full z-50 ml-4 w-56 rounded-lg border border-amber-800/20 bg-amber-50/95 p-4 shadow-xl backdrop-blur-sm"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -10 }}
          transition={{ duration: 0.2 }}
        >
          {coverUrl && (
            <div className="relative mb-2 h-40 w-full overflow-hidden rounded">
              <Image
                src={coverUrl}
                alt={title}
                fill
                className="object-cover"
                sizes="224px"
                {...(blurDataURL ? { placeholder: "blur", blurDataURL } : {})}
              />
            </div>
          )}
          <p className="text-sm font-bold text-amber-900 line-clamp-2">{title}</p>
          <p className="mt-0.5 text-xs text-amber-700/80">{author}</p>
          {format && (
            <span className="mt-1.5 inline-block rounded-full bg-amber-200/60 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-800">
              {format}
            </span>
          )}
          {progress !== undefined && progress > 0 && (
            <div className="mt-1.5">
              <div className="flex items-center justify-between text-[10px] text-amber-700/70">
                <span>Olvasás</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-amber-200/50">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </Link>
  );
}
