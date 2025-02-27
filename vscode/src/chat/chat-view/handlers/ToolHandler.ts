import { spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import type { MessageParam, Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources'
import {
    type FunctionToolSpec,
    PromptString,
    Typewriter,
    firstResultFromOperation,
} from '@sourcegraph/cody-shared'
import type { SubMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import * as vscode from 'vscode'
import { getCategorizedMentions } from '../../../prompt-builder/utils'
import { ChatBuilder } from '../ChatBuilder'
import { DefaultPrompter } from '../prompt'
import { ChatHandler } from './ChatHandler'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'

interface CodyTool {
    spec: Tool | FunctionToolSpec
    invoke: (input: any) => Promise<string>
}

interface ToolCall {
    id: string
    name: string
    input: any
}

const allTools: CodyTool[] = [
    {
        spec: {
            type: 'function',
            function: {
                name: 'get_file',
                description: 'Get the file contents.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: 'The path to the file.',
                        },
                    },
                    required: ['path'],
                },
            },
        },
        invoke: async (input: { path: string }) => {
            // check if input is of type string
            if (typeof input.path !== 'string') {
                throw new Error(`get_file argument must be a string, value was ${JSON.stringify(input)}`)
            }
            const { path: relativeFilePath } = input
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
                if (!workspaceFolder) {
                    throw new Error('No workspace folder found')
                }
                const uri = vscode.Uri.joinPath(workspaceFolder.uri, relativeFilePath)

                const content = await vscode.workspace.fs.readFile(uri)
                return Buffer.from(content).toString('utf-8')
            } catch (error) {
                throw new Error(`Failed to read file ${input.path}: ${error}`)
            }
        },
    },
    {
        spec: {
            type: 'function',
            function: {
                name: 'run_terminal_command',
                description: 'Run an arbitrary terminal command at the root of the users project.',
                parameters: {
                    type: 'object',
                    properties: {
                        command: {
                            type: 'string',
                            description:
                                'The command to run in the root of the users project. Must be shell escaped.',
                        },
                    },
                    required: ['command'],
                },
            },
        },
        invoke: async (input: { command: string }) => {
            if (typeof input.command !== 'string') {
                throw new Error(
                    `run_terminal_command argument must be a string, value was ${JSON.stringify(input)}`
                )
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
            if (!workspaceFolder) {
                throw new Error('No workspace folder found')
            }

            try {
                const commandResult = await runShellCommand(input.command, {
                    cwd: workspaceFolder.uri.path,
                })
                return commandResult.stdout
            } catch (error) {
                throw new Error(`Failed to run terminal command: ${input.command}: ${error}`)
            }
        },
    },
]

export class ExperimentalToolHandler extends ChatHandler implements AgentHandler {
    public async handle(
        {
            // requestID,
            inputText,
            mentions,
            editorState,
            signal,
            chatBuilder,
            // recorder,
            // span,
        }: AgentRequest,
        delegate: AgentHandlerDelegate
    ): Promise<void> {
        const maxTurns = 10
        let turns = 0
        const content = inputText.toString().trim()
        if (!content) {
            throw new Error('Input text cannot be empty')
        }
        const subTranscript: Array<MessageParam> = [
            {
                role: 'user',
                content,
            },
        ]
        const subViewTranscript: SubMessage[] = []
        const toolCalls: ToolCall[] = []

        // Track active content blocks by ID
        // const activeContentBlocks = new Map<
        //     string,
        //     { type: string; name?: string; text?: string }
        // >();
        // let messageInProgress: SubMessage | undefined;

        while (true) {
            toolCalls.length = 0 // Clear the array for each iteration
            try {
                const requestID = crypto.randomUUID()

                console.log(
                    'Debug - subTranscript before message creation:',
                    JSON.stringify(subTranscript)
                )
                // Validate subTranscript before creating message
                if (!subTranscript.length) {
                    console.error('Debug - subTranscript is empty')
                    throw new Error('subTranscript cannot be empty')
                }

                for (const msg of subTranscript) {
                    if (!msg.content || (typeof msg.content === 'string' && !msg.content.trim())) {
                        console.error('Debug - Found empty message in subTranscript:', msg)
                        throw new Error('Found empty message in subTranscript')
                    }
                }

                const contextResult = await this.computeContext(
                    requestID,
                    { text: inputText, mentions },
                    editorState,
                    chatBuilder,
                    delegate,
                    signal
                )

                if (contextResult.error) {
                    delegate.postError(contextResult.error, 'transcript')
                    signal.throwIfAborted()
                }

                const corpusContext = contextResult.contextItems ?? []
                const { explicitMentions, implicitMentions } = getCategorizedMentions(corpusContext)
                const prompter = new DefaultPrompter(explicitMentions, implicitMentions, false)
                const { prompt } = await this.buildPrompt(prompter, chatBuilder, signal, 8)

                const contextWindow = await firstResultFromOperation(
                    ChatBuilder.contextWindowForChat(chatBuilder)
                )

                const stream = await this.chatClient.chat(
                    prompt,
                    {
                        model: 'anthropic::2023-06-01::claude-3.5-sonnet',
                        maxTokensToSample: contextWindow.output,
                        tools: allTools.map(tool => tool.spec),
                    },
                    signal,
                    requestID,
                    8
                )
                let lastContent = ''
                let messageInProgress: SubMessage | undefined
                const typewriter = new Typewriter({
                    update: content => {
                        lastContent = content
                        messageInProgress = {
                            text: PromptString.unsafe_fromLLMResponse(lastContent),
                        }
                        delegate.experimentalPostMessageInProgress([
                            ...subViewTranscript,
                            messageInProgress,
                        ])
                    },
                    close: () => {
                        if (subViewTranscript && messageInProgress) {
                            delegate.experimentalPostMessageInProgress([
                                ...subViewTranscript,
                                messageInProgress,
                            ])
                        }
                    },
                    error: error => {
                        delegate.postError(error, 'transcript')
                    },
                })

                console.log('Debug - stream created successfully')
                for await (const message of stream) {
                    switch (message.type) {
                        case 'change': {
                            typewriter.update(message.text)
                            break
                        }
                        case 'complete': {
                            typewriter.close()
                            typewriter.stop()
                            break
                        }
                        case 'error': {
                            typewriter.close()
                            typewriter.stop(message.error)
                        }
                    }
                }

                if (toolCalls.length === 0) {
                    break
                }

                // Process tool calls as before
                const toolResults: ToolResultBlockParam[] = []
                for (const toolCall of toolCalls) {
                    console.log('Debug - Processing tool call:', toolCall)
                    const tool = allTools.find(tool => tool.spec)
                    if (!tool) {
                        console.error('Debug - Tool not found:', toolCall.name)
                        continue
                    }

                    try {
                        const output = await tool.invoke(toolCall.input)
                        console.log('Debug - Tool output:', output)
                        if (!output?.trim()) {
                            console.warn('Debug - Empty tool output for:', toolCall.name)
                            continue
                        }
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolCall.id,
                            content: output,
                        })
                    } catch (error) {
                        console.error('Debug - Error invoking tool:', toolCall.name, error)
                    }
                }

                subTranscript.push({
                    role: 'user',
                    content: toolResults,
                })

                turns++
                if (turns > maxTurns) {
                    console.error('Max turns reached')
                    break
                }
            } catch (e) {
                new Error(`Unexpected error computing context, no context was used: ${e}`)
            }
        }
        delegate.postDone()
    }
}

interface CommandOptions {
    cwd?: string
    env?: Record<string, string>
}

interface CommandResult {
    stdout: string
    stderr: string
    code: number | null
    signal: NodeJS.Signals | null
}

class CommandError extends Error {
    constructor(
        message: string,
        public readonly result: CommandResult
    ) {
        super(message)
        this.name = 'CommandError'
    }
}

async function runShellCommand(command: string, options: CommandOptions = {}): Promise<CommandResult> {
    const { cwd = process.cwd(), env = process.env } = options

    const timeout = 10_000
    const maxBuffer = 1024 * 1024 * 10
    const encoding = 'utf8'
    const spawnOptions: SpawnOptions = {
        shell: true,
        cwd,
        env,
        windowsHide: true,
    }

    return new Promise((resolve, reject) => {
        const process = spawn(command, [], spawnOptions)

        let stdout = ''
        let stderr = ''
        let killed = false
        const timeoutId = setTimeout(() => {
            killed = true
            process.kill()
            reject(new Error(`Command timed out after ${timeout}ms`))
        }, timeout)

        let stdoutLength = 0
        let stderrLength = 0

        if (process.stdout) {
            process.stdout.on('data', (data: Buffer) => {
                const chunk = data.toString(encoding)
                stdoutLength += chunk.length
                if (stdoutLength > maxBuffer) {
                    killed = true
                    process.kill()
                    reject(new Error('stdout maxBuffer exceeded'))
                    return
                }
                stdout += chunk
            })
        }

        if (process.stderr) {
            process.stderr.on('data', (data: Buffer) => {
                const chunk = data.toString(encoding)
                stderrLength += chunk.length
                if (stderrLength > maxBuffer) {
                    killed = true
                    process.kill()
                    reject(new Error('stderr maxBuffer exceeded'))
                    return
                }
                stderr += chunk
            })
        }

        process.on('error', (error: Error) => {
            if (timeoutId) clearTimeout(timeoutId)
            reject(new Error(`Failed to start process: ${error.message}`))
        })

        process.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
            if (timeoutId) clearTimeout(timeoutId)
            if (killed) return

            const result: CommandResult = {
                stdout,
                stderr,
                code,
                signal,
            }

            if (code === 0) {
                resolve(result)
            } else {
                reject(
                    new CommandError(
                        `Command failed with exit code ${code}${stderr ? ': ' + stderr : ''}`,
                        result
                    )
                )
            }
        })
    })
}
