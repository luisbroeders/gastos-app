import { useCallback, useRef, useState } from 'react'

// Los tipos de SpeechRecognition no vienen en TS por defecto (es una API no
// estandarizada todavía), así que la tipamos mínimamente acá.
interface SpeechRecognitionResultLike {
  transcript: string
}
interface SpeechRecognitionEventLike extends Event {
  results: { [i: number]: { [j: number]: SpeechRecognitionResultLike }; length: number }
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: Event) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isVoiceInputSupported(): boolean {
  return getSpeechRecognitionCtor() !== null
}

/**
 * Nota: el reconocimiento de voz del navegador (Web Speech API) requiere
 * conexión a internet - a diferencia del resto de la app, esta función no
 * funciona offline. Si no hay señal, conviene cargar el gasto a mano.
 */
export function useVoiceInput() {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const start = useCallback((onResult: (transcript: string) => void) => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setError('Tu navegador no soporta dictado por voz. Probá con Chrome.')
      return
    }
    if (!navigator.onLine) {
      setError('El dictado por voz necesita conexión a internet.')
      return
    }

    setError(null)
    const recognition = new Ctor()
    recognition.lang = 'es-AR'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (e) => {
      const transcript = e.results[e.results.length - 1][0].transcript
      onResult(transcript)
    }
    recognition.onerror = () => {
      setError('No se pudo escuchar. Revisá el permiso de micrófono.')
      setListening(false)
    }
    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  return { listening, error, start, stop }
}
