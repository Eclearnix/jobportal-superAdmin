import { useEffect, useRef, useState } from 'react'

const googleScript = 'https://accounts.google.com/gsi/client'

function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  return new Promise((resolve, reject) => {
    let script = document.querySelector(`script[src="${googleScript}"]`)
    if (!script) {
      script = document.createElement('script')
      script.src = googleScript
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', () => resolve(window.google), { once: true })
    script.addEventListener('error', () => reject(new Error('Google sign-in could not be loaded. Check your connection and try again.')), { once: true })
  })
}

export default function GoogleSignInButton({ onCredential, disabled }) {
  const buttonRef = useRef(null)
  const callbackRef = useRef(onCredential)
  const generationRef = useRef(0)
  const [error, setError] = useState('')
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  useEffect(() => { callbackRef.current = onCredential }, [onCredential])

  useEffect(() => {
    const container = buttonRef.current
    if (!clientId || !container) return undefined
    const generation = ++generationRef.current
    let resizeObserver

    loadGoogleIdentity().then((google) => {
      if (generation !== generationRef.current || !container.isConnected) return
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) callbackRef.current(response.credential)
          else setError('Google did not return a sign-in credential. Please try again.')
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      })
      let renderedWidth = 0
      const renderButton = (force = false) => {
        const width = Math.max(200, Math.min(360, Math.floor(container.clientWidth)))
        if (!force && width === renderedWidth) return
        renderedWidth = width
        container.replaceChildren()
        google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          width,
          locale: 'en',
        })
      }
      renderButton(true)
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => renderButton())
        resizeObserver.observe(container)
      }
    }).catch((loadError) => {
      if (generation === generationRef.current) setError(loadError.message)
    })

    return () => {
      generationRef.current += 1
      resizeObserver?.disconnect()
      container.replaceChildren()
    }
  }, [clientId])

  if (!clientId) return <p className="integration-notice">Google sign-in is not configured. Set <code>VITE_GOOGLE_CLIENT_ID</code>.</p>
  return (
    <div className={`google-button ${disabled ? 'is-disabled' : ''}`}>
      <div ref={buttonRef} aria-label="Continue with Google as Super Admin" />
      {disabled && <span className="google-button-cover" aria-hidden="true" />}
      {error && <p className="alert error" role="alert">{error}</p>}
    </div>
  )
}
