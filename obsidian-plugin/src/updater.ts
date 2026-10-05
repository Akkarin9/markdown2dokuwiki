/**
 * Aggiornamento del plugin dal repository pubblico.
 *
 * Scarica `manifest.json`, `main.js` e `styles.css` da
 * `raw.githubusercontent.com/<repo>/<branch>/obsidian-plugin/` e li scrive
 * nella cartella del plugin. Usa `requestUrl` di Obsidian (niente CORS, funziona
 * anche su mobile) e chiede conferma prima di sovrascrivere.
 *
 * Nota: `main.js` è già in esecuzione; il nuovo codice si applica solo dopo un
 * riavvio di Obsidian (o disattivando/riattivando il plugin).
 */

import { Notice, requestUrl, type App } from 'obsidian'
import type Md2DokuPlugin from '../main'
import { confirmAction } from './prompt-modal'

const REPO = 'Akkarin9/markdown2dokuwiki'
const BRANCH = 'main'
const PLUGIN_DIR = 'obsidian-plugin'
const FILES = ['manifest.json', 'main.js', 'styles.css'] as const

/** Confronta due versioni `x.y.z` (numerico). >0 se `a` è più recente di `b`. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

function rawUrl(file: string): string {
  // Il parametro evita la cache CDN di raw.githubusercontent.
  return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${PLUGIN_DIR}/${file}?t=${Date.now()}`
}

/** Cartella del plugin, relativa alla radice del vault (desktop e mobile). */
function pluginFolder(app: App, plugin: Md2DokuPlugin): string {
  const dir = plugin.manifest.dir
  const name = (dir && dir.split(/[/\\]/).pop()) || plugin.manifest.id
  return `${app.vault.configDir}/plugins/${name}`
}

/** Controlla gli aggiornamenti e, su conferma, installa l'ultima versione. */
export async function checkForUpdates(app: App, plugin: Md2DokuPlugin): Promise<void> {
  try {
    const remoteManifest = JSON.parse((await requestUrl({ url: rawUrl('manifest.json') })).text) as {
      id?: string
      version?: string
    }
    if (remoteManifest.id !== plugin.manifest.id) {
      new Notice('Il manifest remoto non corrisponde a questo plugin')
      return
    }

    const current = plugin.manifest.version
    const remote = remoteManifest.version ?? '0.0.0'
    if (compareVersions(remote, current) <= 0) {
      new Notice(`Nessun aggiornamento: versione ${current}`)
      return
    }

    const confirmed = await confirmAction(
      app,
      'Aggiorna il plugin',
      [
        `Versione installata: ${current}`,
        `Versione disponibile: ${remote}`,
        'Verranno sovrascritti main.js, manifest.json e styles.css.',
        'Dopo l\'aggiornamento ricarica Obsidian (Ctrl+R) per applicare.',
      ],
      'Installa',
    )
    if (!confirmed) return

    for (const file of FILES) {
      const response = await requestUrl({ url: rawUrl(file) })
      await app.vault.adapter.write(`${pluginFolder(app, plugin)}/${file}`, response.text)
    }
    new Notice(`Plugin aggiornato a ${remote}. Ricarica Obsidian per applicare.`, 8000)
  } catch (error) {
    new Notice(error instanceof Error ? `Aggiornamento non riuscito: ${error.message}` : 'Aggiornamento non riuscito')
  }
}
