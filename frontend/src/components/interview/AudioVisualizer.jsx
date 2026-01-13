import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

const BAR_COUNT = 24

export default function AudioVisualizer({ level = 0, isActive = false, type = 'user' }) {
  const barsRef = useRef([])
  const animationRef = useRef(null)
  const smoothLevelRef = useRef(0)

  useEffect(() => {
    const animate = () => {
      const targetLevel = isActive ? level : 0
      smoothLevelRef.current += (targetLevel - smoothLevelRef.current) * 0.3

      barsRef.current.forEach((bar, index) => {
        if (!bar) return

        const time = Date.now() / 1000
        const waveOffset = Math.sin(time * 3 + index * 0.3) * 0.3
        const centerDistance = Math.abs(index - BAR_COUNT / 2) / (BAR_COUNT / 2)
        const baseHeight = 1 - centerDistance * 0.5

        const audioInfluence = smoothLevelRef.current * (1 + waveOffset)
        const height = isActive
          ? Math.max(0.15, baseHeight * audioInfluence)
          : 0.15 + Math.sin(time * 2 + index * 0.2) * 0.05

        bar.style.transform = `scaleY(${height})`
        bar.style.opacity = isActive ? 0.6 + height * 0.4 : 0.4
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [level, isActive])

  return (
    <div className="relative h-24 rounded-lg overflow-hidden bg-gradient-to-t from-muted/50 to-transparent">
      <div className="absolute inset-0 flex items-center justify-center gap-1">
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <div
            key={i}
            ref={(el) => (barsRef.current[i] = el)}
            className={cn(
              "w-1.5 h-full rounded-full origin-center transition-colors",
              type === 'user' 
                ? "bg-gradient-to-t from-primary to-primary/60"
                : "bg-gradient-to-t from-accent to-accent/60"
            )}
            style={{ transform: 'scaleY(0.15)' }}
          />
        ))}
      </div>
      
      {/* Glow effect */}
      <div className={cn(
        "absolute inset-0 rounded-lg transition-opacity duration-300",
        isActive ? "opacity-100" : "opacity-0",
        type === 'user'
          ? "bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.1),transparent)]"
          : "bg-[radial-gradient(ellipse_at_center,hsl(var(--accent)/0.1),transparent)]"
      )} />
    </div>
  )
}
