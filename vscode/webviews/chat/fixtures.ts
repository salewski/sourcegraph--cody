import { URI } from 'vscode-uri'

import type { ChatMessage } from '@sourcegraph/cody-shared'

export const FIXTURE_TRANSCRIPT: Record<
    'simple' | 'simple2' | 'codeQuestion' | 'explainCode',
    ChatMessage[]
> = {
    simple: [
        { speaker: 'human', text: 'Hello, world!' },
        { speaker: 'assistant', text: 'Thank you' },
    ],
    simple2: [
        {
            speaker: 'human',
            text: 'What planet are we on?',
        },
        {
            speaker: 'assistant',
            text: 'Earth',
        },
        {
            speaker: 'human',
            text: 'What color is the sky?',
            contextFiles: [{ type: 'file', uri: URI.file('/foo.js') }],
        },
        {
            speaker: 'assistant',
            text: 'Blue.',
        },
    ],
    codeQuestion: [
        {
            speaker: 'human',
            text: 'What does `document.getSelection()?.isCollapsed` mean?',
        },
        {
            speaker: 'assistant',
            text: '`document.getSelection()?.isCollapsed` means that the current selection in the document is collapsed, meaning it is a caret (no text is selected).\n\nThe `?.` operator is optional chaining - it will return `undefined` if `document.getSelection()` returns `null` or `undefined`.\n\nSo in short, that line is checking if there is currently a text selection in the document, and if not, focusing the textarea.\n\n',
        },
    ],
    explainCode: [
        {
            speaker: 'human',
            text: "Explain the following code at a high level:\n\n```\nprivate getNonce(): string {\n  let text = ''\n  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'\n  for (let i = 0; i < 32; i++) {\n    text += possible.charAt(Math.floor(Math.random() * possible.length))\n  }\n  return text\n}\n```",
            contextFiles: [
                { type: 'file', uri: URI.file('/vscode/src/chat/ChatViewProvider.ts') },
                { type: 'file', uri: URI.file('/lib/shared/src/timestamp.ts') },
            ],
        },
        {
            speaker: 'assistant',
            text: 'This code generates a random 32-character string (nonce) using characters A-Z, a-z, and 0-9.',
        },
        {
            speaker: 'human',
            text: 'Rewrite it to only use hexadecimal encoding.',
        },
        {
            speaker: 'assistant',
            text: "Here is the rewritten code using only hexadecimal encoding:\n\n```\nprivate getNonce(): string {\n  let text = ''\n  const possible = '0123456789ABCDEF'\n  for (let i = 0; i < 32; i++) {\n    text += possible.charAt(Math.floor(Math.random() * possible.length))\n  }\n  return text\n}\n```",
        },
    ],
}
