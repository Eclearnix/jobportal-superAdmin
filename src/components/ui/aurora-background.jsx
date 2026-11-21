import './aurora-background.css'

export function AuroraBackground({
  className = '',
  children,
  showRadialGradient = true,
  ...props
}) {
  const classes = [
    'aurora-background',
    showRadialGradient && 'aurora-background--radial',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={classes} {...props}>
      <div className="aurora-background__effect" aria-hidden="true" />
      <div className="aurora-background__content">{children}</div>
    </div>
  )
}
