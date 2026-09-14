import {
  BOOK_MAX_BYTES,
  contentPathIn,
  bookIdFor,
  extensionFor,
  isKnownExtension,
  type Format,
  type KnownExtension,
  type KernelServices,
  type VaultFs,
} from '../../kernel'

export async function detectBookExtension(file: File): Promise<KnownExtension | null> {
  const ext = extensionFor(file.name)
  if (ext !== 'bin' && isKnownExtension(ext)) return ext

  if (file.type === 'application/pdf') return 'pdf'
  if (file.type === 'application/epub+zip') return 'epub'

  try {
    const slice = await file.slice(0, 64).arrayBuffer()
    const bytes = new Uint8Array(slice)
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return 'pdf'
    }
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return 'epub'
    }
  } catch {
    // ignore
  }
  return null
}

/** Upper bound for each file read and native write, including retry paths. */
export const IMPORT_CHUNK_BYTES = 256 * 1024

/** Write bounded chunks, then publish the completed file with one rename. */
export async function writeBookContentSafely(
  fs: VaultFs,
  targetPath: string,
  file: File,
): Promise<void> {
  if (file.size > IMPORT_CHUNK_BYTES && !fs.appendFile) {
    throw new Error('Device storage does not support importing large files in chunks.')
  }
  const writingPath = `${targetPath}.writing`
  const cut = targetPath.lastIndexOf('/')
  if (cut > 0) await fs.mkdir(targetPath.slice(0, cut))
  try {
    // Truncate a partial previous attempt, even when the new file is empty.
    await fs.writeFile(writingPath, new Uint8Array())
    for (let offset = 0; offset < file.size; offset += IMPORT_CHUNK_BYTES) {
      const bytes = new Uint8Array(await file.slice(offset, offset + IMPORT_CHUNK_BYTES).arrayBuffer())
      if (offset === 0) await fs.writeFile(writingPath, bytes)
      else await fs.appendFile!(writingPath, bytes)
    }
    await fs.rename(writingPath, targetPath)
  } catch (cause) {
    await fs.remove(writingPath).catch(() => {})
    throw cause
  }
}

/** Save the record before its content, using the library's ordered write lane. */
export async function importMobileBook(services: KernelServices, file: File): Promise<string> {
  console.log('[Carta:import] start', file.name, file.size, file.type)
  if (!services.fs) throw new Error('Device storage is unavailable.')
  if (file.size === 0) throw new Error('The file is empty.')
  if (file.size > BOOK_MAX_BYTES) throw new Error('The book exceeds the 512 MB import limit.')

  const ext = await detectBookExtension(file)
  console.log('[Carta:import] detected ext:', ext)
  if (!ext) throw new Error('Unsupported book format.')

  const bookId = await bookIdFor(file)
  console.log('[Carta:import] computed bookId:', bookId)
  const cleanName = file.name.replace(/(\.pdf)+$/gi, '').replace(/\.[^.]+$/, '').trim() || 'Untitled'
  const baseName = cleanName.replace(/(\.pdf)+$/gi, '').trim() || 'Untitled'
  const normalizedName = file.name.toLowerCase().endsWith(`.${ext}`) ? `${baseName}.${ext}` : `${baseName}.${ext}`
  const targetPath = contentPathIn(bookId, normalizedName)

  const existing = services.library.getSnapshot().find((b) => b.bookId === bookId)
  if (existing) {
    console.log('[Carta:import] book already exists on shelf:', existing.bookId)
    const cleanExistingTitle = (existing.title || '').replace(/(\.pdf)+$/gi, '').trim()
    if (cleanExistingTitle && cleanExistingTitle !== existing.title) {
      void services.library.update(bookId, (r) => ({ ...r, title: cleanExistingTitle })).catch(() => {})
    }
    if (!(await services.fs.exists(targetPath))) {
      console.log('[Carta:import] saving missing content to:', targetPath)
      await writeBookContentSafely(services.fs, targetPath, file)
      await services.library.refreshContent(bookId)
      await services.drain()
    }
    return bookId
  }

  console.log('[Carta:import] adding to library:', bookId, baseName)
  const outcome = await services.library.add(bookId, {
    title: baseName,
    author: '',
    ext,
    format: ext as Format,
    addedAt: Date.now(),
  }, true)
  if (outcome !== 'added') throw new Error('The book could not be saved. Please retry.')
  console.log('[Carta:import] writing content safely to:', targetPath)
  await writeBookContentSafely(services.fs, targetPath, file)
  if (!(await services.fs.exists(targetPath))) {
    throw new Error('The book file was not saved. Please retry.')
  }
  console.log('[Carta:import] content saved, refreshing and draining...')
  await services.library.refreshContent(bookId)
  await services.drain()
  console.log('[Carta:import] complete:', bookId)
  return bookId
}

