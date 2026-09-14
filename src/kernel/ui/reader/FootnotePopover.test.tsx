// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FootnotePopover } from './FootnotePopover'
import type { FootnoteRender } from './session'

afterEach(cleanup)

function mockNote(scrollHeight = 60): FootnoteRender {
  const noteEl = document.createElement('div')
  return {
    view: Object.assign(noteEl, {
      renderer: {
        getContents: () => [{ doc: { body: { scrollHeight } } }],
      },
    }) as unknown as FootnoteRender['view'],
    href: 'chapter1.xhtml#note-1',
    type: 'footnote',
    at: { top: 100, left: 50, width: 20, height: 16, bottom: 116, right: 70 },
  }
}

describe('FootnotePopover', () => {
  it('stays parked offscreen when there is no note', () => {
    const { container } = render(
      <FootnotePopover
        note={null}
        stage={null}
        column={null}
        onMount={vi.fn()}
        onCopy={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(container.querySelector('[data-footnote-backdrop]')).toBeNull()
  })

  it('renders the dialog and backdrop when a note is fitted', async () => {
    const note = mockNote(80)
    const onDismiss = vi.fn()

    const { container } = render(
      <FootnotePopover
        note={note}
        stage={document.createElement('div')}
        column={null}
        onMount={vi.fn()}
        onCopy={vi.fn()}
        onDismiss={onDismiss}
      />,
    )

    expect(screen.getByRole('dialog')).not.toBeNull()
    const backdrop = container.querySelector('[data-footnote-backdrop]')
    expect(backdrop).not.toBeNull()
  })

  it('dismisses when clicking outside on the backdrop', () => {
    const note = mockNote(80)
    const onDismiss = vi.fn()

    const { container } = render(
      <FootnotePopover
        note={note}
        stage={document.createElement('div')}
        column={null}
        onMount={vi.fn()}
        onCopy={vi.fn()}
        onDismiss={onDismiss}
      />,
    )

    const backdrop = container.querySelector('[data-footnote-backdrop]')!
    expect(backdrop).not.toBeNull()

    act(() => {
      fireEvent.pointerDown(backdrop, { isPrimary: true, button: 0 })
      expect(onDismiss).not.toHaveBeenCalled()
      fireEvent.pointerUp(backdrop, { isPrimary: true, button: 0 })
      fireEvent.click(backdrop)
    })

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses when clicking the close button in the dialog header', () => {
    const note = mockNote(80)
    const onDismiss = vi.fn()

    render(
      <FootnotePopover
        note={note}
        stage={document.createElement('div')}
        column={null}
        onMount={vi.fn()}
        onCopy={vi.fn()}
        onDismiss={onDismiss}
      />,
    )

    const closeBtn = screen.getByLabelText('Close this note')
    act(() => {
      fireEvent.click(closeBtn)
    })

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
