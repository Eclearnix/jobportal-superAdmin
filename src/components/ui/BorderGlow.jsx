import { useCallback, useEffect, useRef } from 'react'
import './BorderGlow.css'

function parseHSL(hslStr) {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/)
  if (!match) return { h: 40, s: 80, l: 80 }
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) }
}

function buildGlowVars(glowColor, intensity) {
  const { h, s, l } = parseHSL(glowColor)
  const base = `${h}deg ${s}% ${l}%`
  const opacities = [100, 60, 50, 40, 30, 20, 10]
  const keys = ['', '-60', '-50', '-40', '-30', '-20', '-10']
  const vars = {}
  for (let i = 0; i < opacities.length; i++) {
    vars[`--glow-color${keys[i]}`] = `hsl(${base} / ${Math.min(opacities[i] * intensity, 100)}%)`
  }
  return vars
}

const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%']
const GRADIENT_KEYS = ['--gradient-one', '--gradient-two', '--gradient-three', '--gradient-four', '--gradient-five', '--gradient-six', '--gradient-seven']
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1]

function buildGradientVars(colors) {
  const vars = {}
  for (let i = 0; i < 7; i++) {
    const color = colors[Math.min(COLOR_MAP[i], colors.length - 1)]
    vars[GRADIENT_KEYS[i]] = `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${color} 0px, transparent 50%)`
  }
  vars['--gradient-base'] = `linear-gradient(${colors[0]} 0 100%)`
  return vars
}

function isLightColor(color) {
  const value = color.trim().replace('#', '')
  if (!/^[\da-f]{3}([\da-f]{3})?$/i.test(value)) return false
  const hex = value.length === 3 ? value.split('').map((character) => character + character).join('') : value
  const red = parseInt(hex.slice(0, 2), 16)
  const green = parseInt(hex.slice(2, 4), 16)
  const blue = parseInt(hex.slice(4, 6), 16)
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 > 180
}

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3
}

function easeInCubic(value) {
  return value ** 3
}

function animateValue({
  start = 0,
  end = 100,
  duration = 1000,
  delay = 0,
  ease = easeOutCubic,
  onUpdate,
  onEnd,
}) {
  const startTime = performance.now() + delay
  let frame = 0
  function tick() {
    const elapsed = performance.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    onUpdate(start + (end - start) * ease(progress))
    if (progress < 1) frame = requestAnimationFrame(tick)
    else onEnd?.()
  }
  const timer = setTimeout(() => {
    frame = requestAnimationFrame(tick)
  }, delay)
  return () => {
    clearTimeout(timer)
    cancelAnimationFrame(frame)
  }
}

export default function BorderGlow({
  children,
  className = '',
  edgeSensitivity = 30,
  glowColor = '40 80 80',
  backgroundColor = '#120F17',
  borderRadius = 28,
  glowRadius = 40,
  glowIntensity = 1,
  coneSpread = 25,
  animated = false,
  colors = ['#c084fc', '#f472b6', '#38bdf8'],
  fillOpacity = 0.5,
}) {
  const cardRef = useRef(null)

  const getCenterOfElement = useCallback((element) => {
    const { width, height } = element.getBoundingClientRect()
    return [width / 2, height / 2]
  }, [])

  const getEdgeProximity = useCallback((element, x, y) => {
    const [centerX, centerY] = getCenterOfElement(element)
    const deltaX = x - centerX
    const deltaY = y - centerY
    const xRatio = deltaX === 0 ? Infinity : centerX / Math.abs(deltaX)
    const yRatio = deltaY === 0 ? Infinity : centerY / Math.abs(deltaY)
    return Math.min(Math.max(1 / Math.min(xRatio, yRatio), 0), 1)
  }, [getCenterOfElement])

  const getCursorAngle = useCallback((element, x, y) => {
    const [centerX, centerY] = getCenterOfElement(element)
    const deltaX = x - centerX
    const deltaY = y - centerY
    if (deltaX === 0 && deltaY === 0) return 0
    let degrees = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 90
    if (degrees < 0) degrees += 360
    return degrees
  }, [getCenterOfElement])

  const handlePointerMove = useCallback((event) => {
    const card = cardRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const edge = getEdgeProximity(card, x, y)
    const angle = getCursorAngle(card, x, y)
    card.style.setProperty('--edge-proximity', `${(edge * 100).toFixed(3)}`)
    card.style.setProperty('--cursor-angle', `${angle.toFixed(3)}deg`)
  }, [getEdgeProximity, getCursorAngle])

  useEffect(() => {
    if (!animated || !cardRef.current) return undefined
    const card = cardRef.current
    const angleStart = 110
    const angleEnd = 465
    card.classList.add('sweep-active')
    card.style.setProperty('--cursor-angle', `${angleStart}deg`)

    const animations = [
      animateValue({ duration: 500, onUpdate: (value) => card.style.setProperty('--edge-proximity', value) }),
      animateValue({
        ease: easeInCubic,
        duration: 1500,
        end: 50,
        onUpdate: (value) => card.style.setProperty('--cursor-angle', `${(angleEnd - angleStart) * (value / 100) + angleStart}deg`),
      }),
      animateValue({
        ease: easeOutCubic,
        delay: 1500,
        duration: 2250,
        start: 50,
        end: 100,
        onUpdate: (value) => card.style.setProperty('--cursor-angle', `${(angleEnd - angleStart) * (value / 100) + angleStart}deg`),
      }),
      animateValue({
        ease: easeInCubic,
        delay: 2500,
        duration: 1500,
        start: 100,
        end: 0,
        onUpdate: (value) => card.style.setProperty('--edge-proximity', value),
        onEnd: () => card.classList.remove('sweep-active'),
      }),
    ]

    return () => {
      animations.forEach((cancel) => cancel())
      card.classList.remove('sweep-active')
    }
  }, [animated])

  const lightSurface = isLightColor(backgroundColor)
  const style = {
    '--card-bg': backgroundColor,
    '--edge-sensitivity': edgeSensitivity,
    '--border-radius': `${borderRadius}px`,
    '--glow-padding': `${glowRadius}px`,
    '--cone-spread': coneSpread,
    '--fill-opacity': fillOpacity,
    ...buildGlowVars(glowColor, glowIntensity),
    ...buildGradientVars(colors),
  }

  return (
    <div
      ref={cardRef}
      onPointerEnter={handlePointerMove}
      onPointerMove={handlePointerMove}
      className={`border-glow-card${lightSurface ? ' border-glow-card--light' : ''} ${className}`}
      style={style}
    >
      <span className="edge-light" />
      <div className="border-glow-inner">{children}</div>
    </div>
  )
}
