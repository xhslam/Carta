import { describe, expect, it } from 'vitest'
import { createKernelServices, loadShelf, contentPathIn } from '../../kernel'
import { fakeFs } from '../../kernel/testkit'
import { importMobileBook } from './importBooks'
import { localContent } from './localContent'

describe('mobile book intake', () => {
  it.each(['epub', 'pdf'])('keeps %s bytes and can reopen them after reloading the shelf', async (ext) => {
    const fs = fakeFs()
    const services = createKernelServices({ fs, storage: null, initialBooks: [] })
    const file = new File(['book-content'], `Sample.${ext}`)
    const id = await importMobileBook(services, file)
    const shelf = await loadShelf(fs)
    const reopened = createKernelServices({ fs, storage: null, initialBooks: shelf.books })
    const content = localContent({ fs, sizes: null, bookOf: (key) => reopened.library.getSnapshot().find((b) => b.bookId === key) })
    expect((await content.locate(id)).here).toBe(true)
    expect(await (await content.fileOf(id, file.name)).text()).toBe('book-content')
    await reopened.drain()
  })

  it('does not duplicate a book or overwrite its title and reading position on reimport', async () => {
    const services = createKernelServices({ fs: fakeFs(), storage: null, initialBooks: [] })
    const file = new File(['same-content'], 'original.epub')
    const id = await importMobileBook(services, file)
    await services.library.update(id, (record) => ({ ...record, title: 'Real title' }))
    await services.library.rememberPosition(id, 'epubcfi(/6/4!/4/2)', 0.4)
    expect(await importMobileBook(services, new File(['same-content'], 'renamed.epub'))).toBe(id)
    expect(services.library.getSnapshot()).toHaveLength(1)
    expect(services.library.getSnapshot()[0]?.title).toBe('Real title')
    expect(services.library.positionOf(id)).toBe('epubcfi(/6/4!/4/2)')
  })

  it('reports a failed content write and repairs it on retry', async () => {
    const fs = fakeFs()
    const write = fs.writeFile.bind(fs)
    let fail = true
    fs.writeFile = async (path, bytes) => {
      if (fail && path.includes('content.epub')) throw new Error('disk full')
      return write(path, bytes)
    }
    const services = createKernelServices({ fs, storage: null, initialBooks: [] })
    const file = new File(['content'], 'sample.epub')
    await expect(importMobileBook(services, file)).rejects.toThrow('disk full')
    fail = false
    const id = await importMobileBook(services, file)
    expect(await fs.exists(contentPathIn(id, file.name))).toBe(true)
    expect(services.library.getSnapshot()).toHaveLength(1)
  })

  it('refuses unsupported and empty files before creating a shelf entry', async () => {
    const services = createKernelServices({ fs: fakeFs(), storage: null, initialBooks: [] })
    await expect(importMobileBook(services, new File(['x'], 'test.exe'))).rejects.toThrow('Unsupported')
    await expect(importMobileBook(services, new File([], 'empty.epub'))).rejects.toThrow('empty')
    expect(services.library.getSnapshot()).toEqual([])
  })
})

describe('bounded mobile content writes', () => {
  it('never reads or writes a whole large PDF, and preserves all bytes', async () => {
    const { writeBookContentSafely, IMPORT_CHUNK_BYTES } = await import('./importBooks')
    const fs = fakeFs()
    const originalWrite = fs.writeFile.bind(fs)
    const sizes: number[] = []
    fs.writeFile = async (path, bytes) => { sizes.push(bytes.length); await originalWrite(path, bytes) }
    fs.appendFile = async (path, bytes) => {
      sizes.push(bytes.length)
      const before = await fs.readFile(path)
      const joined = new Uint8Array(before.length + bytes.length)
      joined.set(before); joined.set(bytes, before.length)
      await originalWrite(path, joined)
    }
    const bytes = Uint8Array.from({ length: IMPORT_CHUNK_BYTES * 3 + 17 }, (_, i) => i % 251)
    const file = new File([bytes], 'scan.pdf')
    file.arrayBuffer = async () => { throw new Error('whole-file allocation') }
    await writeBookContentSafely(fs, 'books/test/content.pdf', file)
    expect(await fs.readFile('books/test/content.pdf')).toEqual(bytes)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(IMPORT_CHUNK_BYTES)
    expect(sizes.filter((n) => n > 0)).toHaveLength(4)
  })

  it('does not retry a failed chunk by allocating the whole file', async () => {
    const { writeBookContentSafely, IMPORT_CHUNK_BYTES } = await import('./importBooks')
    const fs = fakeFs()
    fs.appendFile = async () => { throw new Error('disk full') }
    const path = 'books/test/content.pdf'
    await fs.writeFile(path, new Uint8Array([1, 2, 3]))
    const file = new File([new Uint8Array(IMPORT_CHUNK_BYTES + 1)], 'scan.pdf')
    file.arrayBuffer = async () => { throw new Error('whole-file fallback') }
    await expect(writeBookContentSafely(fs, path, file)).rejects.toThrow('disk full')
    expect(await fs.readFile(path)).toEqual(new Uint8Array([1, 2, 3]))
    expect([...fs.store.keys()].some((key) => key.startsWith(`${path}.writing.`))).toBe(false)
  })

  it('syncs the complete temporary file before publishing it, then syncs its directory', async () => {
    const { writeBookContentSafely } = await import('./importBooks')
    const fs = fakeFs()
    const operations: string[] = []
    const rename = fs.rename.bind(fs)
    fs.fsync = async (path, level) => { operations.push(`sync:${path}:${level}`) }
    fs.rename = async (from, to) => {
      operations.push(`rename:${from}:${to}`)
      await rename(from, to)
    }

    await writeBookContentSafely(fs, 'books/test/content.epub', new File(['complete'], 'book.epub'))

    expect(operations).toHaveLength(3)
    expect(operations[0]).toMatch(/^sync:books\/test\/content\.epub\.writing\.\d+:full$/)
    expect(operations[1]).toMatch(/^rename:books\/test\/content\.epub\.writing\.\d+:books\/test\/content\.epub$/)
    expect(operations[2]).toBe('sync:books/test:full')
  })

  it('uses a private staging file for concurrent writes to the same target', async () => {
    const { writeBookContentSafely } = await import('./importBooks')
    const fs = fakeFs()
    const staged = new Set<string>()
    const write = fs.writeFile.bind(fs)
    fs.writeFile = async (path, bytes) => {
      if (path.includes('.writing.')) staged.add(path)
      await write(path, bytes)
    }

    const path = 'books/test/content.epub'
    await Promise.all([
      writeBookContentSafely(fs, path, new File(['first'], 'first.epub')),
      writeBookContentSafely(fs, path, new File(['second'], 'second.epub')),
    ])

    expect(staged.size).toBe(2)
    expect([...fs.store.keys()].some((key) => key.startsWith(`${path}.writing.`))).toBe(false)
    expect(['first', 'second']).toContain(new TextDecoder().decode(await fs.readFile(path)))
  })
})
