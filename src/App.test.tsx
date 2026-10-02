// @vitest-environment happy-dom
/**
 * Smoke test dell'interfaccia (environment DOM `happy-dom`).
 *
 * CodeMirror è sostituito da un `<textarea>` semplice (mock di `LazyEditor`):
 * nel DOM di test non ha un motore di layout e il suo parser Stream è già coperto
 * altrove. Così verifichiamo il flusso reale dei dati nell'App: conversione live,
 * pannelli, cambio direzione, profili, diff.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// React 18 richiede questo flag per `act` fuori da @testing-library.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./components/LazyEditor', async () => {
  const React = await import('react')
  return {
    LazyEditor: ({
      value,
      onChange,
      readOnly,
      ariaLabel,
    }: {
      value: string
      onChange: (v: string) => void
      readOnly?: boolean
      ariaLabel: string
    }) =>
      React.createElement('textarea', {
        'aria-label': ariaLabel,
        readOnly,
        value,
        onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      }),
  }
})

vi.mock('./components/Editor', async () => {
  const React = await import('react')
  return { Editor: () => React.createElement('div') }
})

import App from './App'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render() {
  act(() => root.render(createElement(App)))
}

function input(): HTMLTextAreaElement {
  return document.querySelector('[aria-label="Editor di input"]') as HTMLTextAreaElement
}
function output(): HTMLTextAreaElement {
  return document.querySelector('[aria-label="Editor di output"]') as HTMLTextAreaElement
}

/** Imposta il valore di una textarea React in modo che l'`onChange` scatti. */
function setValue(el: HTMLTextAreaElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text))
}

/** La conversione è debounced di 250 ms: aspettiamo oltre la soglia. */
async function flushDebounce() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 320))
  })
}

describe('App — smoke test', () => {
  it('converte in live man mano che si scrive', async () => {
    render()
    await setValue(input(), '# Titolo\n\n**grassetto**')
    await flushDebounce()
    expect(output().value).toContain('====== Titolo ======')
    expect(output().value).toContain('**grassetto**')
  })

  it("carica l'esempio e converte le estensioni Obsidian", async () => {
    render()
    const example = buttonByText('Esempio')
    expect(example).toBeDefined()
    act(() => example!.click())
    await flushDebounce()
    expect(output().value).toContain('====== Guida alla prenotazione delle sale ======')
    expect(output().value).toContain('{{planimetria.jpg?400}}')
  })

  it('cambia direzione e converte DokuWiki in Markdown', async () => {
    render()
    const dokuBtn = buttonByText('Doku → MD')
    expect(dokuBtn).toBeDefined()
    act(() => dokuBtn!.click())
    await setValue(input(), '====== Titolo ======\n\n//corsivo//')
    await flushDebounce()
    expect(output().value).toContain('# Titolo')
    expect(output().value).toContain('*corsivo*')
  })

  it('mostra il pannello delle note di conversione per un H6', async () => {
    render()
    await setValue(input(), '###### H6 troppo profondo')
    await flushDebounce()
    expect(document.body.textContent).toContain('Note di conversione')
    expect(document.body.textContent).toContain('H6')
  })

  it('apre le opzioni e mostra i profili raggruppati', () => {
    render()
    const optionsBtn = document.querySelector('[aria-label="Apri opzioni"]') as HTMLButtonElement
    expect(optionsBtn).toBeTruthy()
    act(() => optionsBtn.click())
    expect(document.body.textContent).toContain('Profilo')
    expect(document.body.textContent).toContain('Namespace')
  })

  it('apre la vista diff con la casella di confronto', async () => {
    render()
    await setValue(input(), '# Titolo')
    await flushDebounce()
    const diffBtn = buttonByText('Diff')
    expect(diffBtn).toBeDefined()
    act(() => diffBtn!.click())
    expect(document.querySelector('textarea[placeholder^="Incolla"]')).toBeTruthy()
  })
})
