import * as vscode from 'vscode'

const EMOJI_SVG_TEMPLATE = `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24px">{emoji}</text>
</svg>`

export const transformEmojiToSvg = (emoji: string) => {
    const svg = EMOJI_SVG_TEMPLATE.replace('{emoji}', emoji)
    const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
    return vscode.Uri.parse(uri)
}

export function findRangeOfText(document: vscode.TextDocument, searchText: string): vscode.Range | null {
    for (let line = 0; line < document.lineCount; line++) {
        const lineText = document.lineAt(line)
        const indexOfText = lineText.text.indexOf(searchText)

        if (indexOfText >= 0) {
            const start = new vscode.Position(line, indexOfText)
            const end = new vscode.Position(line, indexOfText + searchText.length)
            return new vscode.Range(start, end)
        }
    }

    return null
}

export class CodyChatLinkProvider implements vscode.DocumentLinkProvider {
    constructor(public editor: vscode.TextEditor) {}

    provideDocumentLinks(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentLink[]> {
        if (document.uri.fsPath !== this.editor.document.uri.fsPath) {
            return []
        }

        const linkRange = findRangeOfText(document, 'Start a Chat')
        if (!linkRange) {
            return []
        }

        const decorationType = vscode.window.createTextEditorDecorationType({
            color: new vscode.ThemeColor('textLink.activeForeground'),
        })
        this.editor.setDecorations(decorationType, [{ range: linkRange }])

        return [new vscode.DocumentLink(linkRange, vscode.Uri.parse('command:cody.tutorial.chat'))]
    }
}
