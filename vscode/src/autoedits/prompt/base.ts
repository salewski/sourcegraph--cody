import type * as vscode from 'vscode'

import type {
    AutoEditsTokenLimit,
    AutocompleteContextSnippet,
    CodeToReplaceData,
    PromptString,
} from '@sourcegraph/cody-shared'

import type { AutoeditsPrompt } from '../adapters/base'

import { SYSTEM_PROMPT } from './constants'
import { getCompletionsPromptWithSystemPrompt } from './prompt-utils'

export interface UserPromptArgs {
    document: vscode.TextDocument
    codeToReplaceData: CodeToReplaceData
    context: AutocompleteContextSnippet[]
    tokenBudget: AutoEditsTokenLimit
}

interface UserPromptForModelArgs extends UserPromptArgs {
    isChatModel: boolean
}

const IS_AGENT_TESTING = process.env.CODY_SHIM_TESTING === 'true'

/**
 * Class for generating user prompts in auto-edit functionality.
 * The major difference between different strategy is the prompt rendering.
 */
export abstract class AutoeditsUserPromptStrategy {
    protected abstract getUserPrompt(args: UserPromptArgs): PromptString

    public getPromptForModelType({
        isChatModel,
        ...userPromptArgs
    }: UserPromptForModelArgs): AutoeditsPrompt {
        if (IS_AGENT_TESTING) {
            // Need deterministic ordering of context files for the tests to pass
            // consistently across different file systems.
            userPromptArgs.context.sort((a, b) => a.uri.path.localeCompare(b.uri.path))
        }
        const prompt = this.getUserPrompt(userPromptArgs)

        const adjustedPrompt: AutoeditsPrompt = isChatModel
            ? { systemMessage: SYSTEM_PROMPT, userMessage: prompt }
            : { userMessage: getCompletionsPromptWithSystemPrompt(SYSTEM_PROMPT, prompt) }

        return adjustedPrompt
    }
}
