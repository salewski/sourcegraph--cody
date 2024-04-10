import {
    type AuthStatus,
    FeatureFlag,
    featureFlagProvider,
    isCodyIgnoredFile,
    logDebug,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { executeEdit } from '../edit/execute'
import { fetchDocumentSymbols } from '../edit/input/utils'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'
import { logFirstEnrollmentEvent } from '../services/utils/enrollment-event'
import { execQueryWrapper as execQuery } from '../tree-sitter/query-sdk'
import { executeDocCommand, executeTestEditCommand } from './execute'
import { executeHoverChatCommand } from './execute/hover'
import type { CodyCommandArgs } from './types'

/**
 * NOTE: Behind the feature flag `cody-hover-commands`.
 *
 * Provides clickable commands on hover and handles clicking on commands.
 */
class HoverCommandsProvider implements vscode.Disposable {
    private readonly id = FeatureFlag.CodyHoverCommands
    private disposables: vscode.Disposable[] = []

    // For determining if we should show on hover or not
    private isActive = false // If the configuration is enabled

    // For the a/b test experimentation
    private isInTreatment = false // If the feature flag is enabled
    private isEnrolled = false

    // To store the current hover context for command clicks
    private current: {
        // The document where the cursor is hovering
        document?: vscode.TextDocument
        // Position of the cursor in the document
        position?: vscode.Position
        // Symbol under the cursor
        symbol?: vscode.DocumentSymbol
        // Selection range if the cursor is on a multi-line highlight
        selection?: vscode.Selection
        // Diagnostics error message if the cursor is on an error
        error?: string
    } = {}

    private register(): void {
        if (this.disposables.length) {
            return
        }
        logDebug('HoverCommandsProvider', 'registering')
        this.disposables.push(
            // Registers the hover provider to provide hover information when hovering over code.
            vscode.languages.registerHoverProvider('*', { provideHover: this.onHover.bind(this) }),
            //  Registers the 'cody.experiment.hover.commands' command to handle clicking hover commands.
            vscode.commands.registerCommand('cody.experiment.hover.commands', id => this.onClick(id)),
            // Log telemetry for users in the treatment group but disabled the configuration after enrollment
            vscode.workspace.onDidChangeConfiguration(e => {
                if (!this.isEnrolled || !this.isInTreatment || !e.affectsConfiguration('cody')) {
                    return
                }
                const updated = isHoverCommandsEnabled()
                if (this.isActive && !updated) {
                    const v2 = { hasV2Event: true }
                    telemetryService.log('CodyVSCodeExtension:hoverCommands:disabled', {}, v2)
                    telemetryRecorder.recordEvent('cody.hoverCommands', 'disabled', {
                        privateMetadata: {},
                    })
                }
                this.isActive = updated
            })
        )
    }

    /**
     * Handles providing Cody commands when hovering over code.
     * Logs telemetry whenever a hover command is visible.
     */
    private async onHover(
        doc: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Hover | undefined> {
        // Only show hover commands for files
        this.current = {}
        if (doc.uri?.scheme !== 'file' || isCodyIgnoredFile(doc.uri)) {
            return undefined
        }

        // Skip if isEnrolled is false so that we can log the first enrollment event.
        if (!this.isActive && this.isEnrolled) {
            this.reset()
            return undefined
        }

        this.current.document = doc
        this.current.position = position

        // Get the clickable commands for the current hover
        const commands = await this.getHoverCommands(doc, position)
        if (!commands.length) {
            return undefined
        }

        // Log Enrollment event at the first Hover Commands for all users,
        // then dispose the provider if the user is not in the treatment group.
        if (!this.isEnrolled) {
            this.isEnrolled = logFirstEnrollmentEvent(this.id, this.isInTreatment)
            if (!this.isInTreatment) {
                this.dispose()
                return undefined
            }
        }

        // Create contents for the hover with clickable commands
        const contents = new vscode.MarkdownString(
            '$(cody-logo) ' + commands.map(c => createHoverCommandTitle(c.id, c.title)).join(' | ')
        )
        contents.supportThemeIcons = true
        contents.isTrusted = true

        // Log the visibility of the hover commands
        const args = { commands: commands.map(c => c.title).join(', '), languageId: doc.languageId }
        telemetryService.log('CodyVSCodeExtension:hoverCommands:visible', args, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.hoverCommands', 'visible', { privateMetadata: args })

        return new vscode.Hover(contents)
    }

    protected async getHoverCommands(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<HoverCommand[]> {
        const commandsOnHovers = { ...HoverCommands() }
        const selection = vscode.window.activeTextEditor?.selection
        const [docNode] = execQuery({ document, position, queryWrapper: 'getDocumentableNode' })
        const [testNode] = execQuery({ document, position, queryWrapper: 'getTestableNode' })
        const activeSymbol = (await fetchDocumentSymbols(document)).findLast(s =>
            s.range.contains(position)
        )
        const diagnostics = vscode.languages.getDiagnostics(document.uri)
        const onError = diagnostics.find(d => d.range.contains(position))?.message

        this.current.selection = selection
        this.current.symbol = activeSymbol

        const showDoc = docNode.symbol?.node && docNode.meta?.showHint
        const showTest = testNode.symbol?.node && testNode.meta?.showHint

        if (onError) {
            this.current.error = onError
            commandsOnHovers.ask.enabled = true
        } else if (selection?.contains(position) && !selection?.isSingleLine) {
            // CHAT & EDIT for multi-line selections
            commandsOnHovers.chat.enabled = true
            commandsOnHovers.edit.enabled = true
        } else if (showDoc && showTest) {
            // EXPLAIN, DOC and TEST for documentable + testable nodes
            commandsOnHovers.explain.enabled = true
            commandsOnHovers.doc.enabled = true
            commandsOnHovers.test.enabled = true
            commandsOnHovers.edit.enabled = true
        } else if (showDoc) {
            // EXPLAIN AND DOC for documentable nodes
            commandsOnHovers.explain.enabled = true
            commandsOnHovers.doc.enabled = true
            commandsOnHovers.edit.enabled = true
        } else if (showTest) {
            // EXPLAIN AND TEST for testable nodes
            commandsOnHovers.explain.enabled = true
            commandsOnHovers.test.enabled = true
            commandsOnHovers.edit.enabled = true
        } else if (docNode.symbol?.node && activeSymbol) {
            // CHAT & EDIT for workspace symbols
            commandsOnHovers.chat.enabled = true
            commandsOnHovers.edit.enabled = true
        } else {
            return []
        }

        return Object.values(commandsOnHovers).filter(c => c.enabled)
    }

    /**
     * Handles clicking on a command from the hover. Opens the current document, selects the
     * current position, and executes the given command id.
     */
    private async onClick(id: string): Promise<void> {
        const { document, position, symbol, selection, error } = this.current ?? {}
        if (!document || !position) {
            return
        }

        const args = {
            id,
            languageID: this.current.document?.languageId,
            type: error ? 'error' : symbol ? 'symbol' : 'selection',
        }
        telemetryService.log('CodyVSCodeExtension:hoverCommands:clicked', args, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.hoverCommands', 'clicked', { privateMetadata: args })

        const cursor = new vscode.Range(position, position)
        const range = symbol?.range ?? selection ?? cursor
        const commandArgs = { source: 'hover', uri: document.uri, range } as CodyCommandArgs

        switch (id) {
            case 'cody.command.document-code':
                // Use the current cursor position to let the document command
                // determind the correct insertion point for the documentable node
                commandArgs.range = cursor
                executeDocCommand(commandArgs)
                break
            case 'cody.command.edit-code':
                commandArgs.configuration = { range, document }
                executeEdit(commandArgs)
                break
            // New Chat Commands
            case 'cody.action.chat': {
                const symbolKind = symbol?.kind ? vscode.SymbolKind[symbol.kind].toLowerCase() : ''
                const symbolPrompt = symbol?.name ? `#${symbol.name} (${symbolKind})` : ''
                const helpPrompt = error ? '\nExplain this error:\n' + error : ''
                commandArgs.additionalInstruction = symbolPrompt + helpPrompt
                executeHoverChatCommand(commandArgs)
                break
            }
            case 'cody.action.unit-tests': {
                // Use the current cursor position to let the test command
                // determind the correct insertion point for the testable node
                commandArgs.range = cursor
                executeTestEditCommand(commandArgs)
                break
            }
            default:
                vscode.commands.executeCommand(id, commandArgs)
        }
    }

    public syncAuthStatus(authStatus: AuthStatus): void {
        if (!authStatus.isLoggedIn || !authStatus.isDotCom) {
            this.isActive = false
            this.reset()
            return
        }

        // Check if the feature flag for Hover Command is enabled for the user
        featureFlagProvider
            .evaluateFeatureFlag(this.id)
            .then(async hoverFlag => {
                this.isInTreatment = hoverFlag
                this.isActive = isHoverCommandsEnabled()
                this.register()
            })
            .catch(error => {
                logDebug('HoverCommandsProvider:failed', error)
            })

        // Log telemetry for users who are in the treatment group but disabled the configuration
        if (this.isInTreatment && !this.isActive && !this.isEnrolled) {
            telemetryService.log('CodyVSCodeExtension:hoverCommands:disabled', {}, { hasV2Event: true })
            telemetryRecorder.recordEvent('cody.hoverCommands', 'disabled', {
                privateMetadata: {},
            })
        }
    }

    public getEnablement(): boolean {
        return this.isInTreatment
    }

    private reset(): void {
        this.current = {}
    }

    public dispose(): void {
        this.isActive = false
        this.reset()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}

/**
 * Checks if hover commands are enabled in the experimental configuration.
 *
 * Hover commands allow showing commands related to the symbol under the cursor in a hover.
 * It is disabled if the `hoverCommands` setting is specifically set to `false`.
 */
export function isHoverCommandsEnabled(): boolean {
    const experimentalConfigs = vscode.workspace.getConfiguration('cody.experimental')
    return experimentalConfigs.get<boolean>('hoverCommands') ?? true
}

interface HoverCommand {
    id: string
    title: string
    enabled: boolean
}

const HoverCommands: () => Record<string, HoverCommand> = () => ({
    explain: {
        id: 'cody.command.explain-code',
        title: 'Explain Code',
        enabled: false,
    },
    doc: {
        id: 'cody.command.document-code',
        title: 'Document Code',
        enabled: false,
    },
    test: {
        id: 'cody.command.unit-tests',
        title: 'Test Code',
        enabled: false,
    },
    chat: {
        id: 'cody.action.chat',
        title: 'New Chat',
        enabled: false,
    },
    edit: {
        id: 'cody.command.edit-code',
        title: 'Edit Code',
        enabled: false,
    },
    ask: {
        id: 'cody.action.chat',
        title: 'Explain Error',
        enabled: false,
    },
})

const HOVER_COMMAND_TITLE_TEMPLATE = '[{title}](command:cody.experiment.hover.commands?{params})'
const createHoverCommandTitle = (id: string, title: string): string => {
    return HOVER_COMMAND_TITLE_TEMPLATE.replace('{title}', title).replace(
        '{params}',
        encodeURIComponent(JSON.stringify([id]))
    )
}

export const hoverCommandsProvider = new HoverCommandsProvider()
