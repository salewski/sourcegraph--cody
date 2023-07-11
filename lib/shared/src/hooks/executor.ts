import { Message } from '../sourcegraph-api'

import { Hooks } from '.'

/**
 * A HooksExecutor runs the hooks defined for a given step.
 */
export interface HooksExecutor {
    /**
     * Runs all pre-chat hooks and returns the augmented messages.
     *
     * @param input The input chat messages.
     * @returns The augmented messages.
     */
    preChat(messages: Message[]): Promise<Message[]>
}

export function createHooksExecutor(hooks: Hooks): HooksExecutor {
    return {
        async preChat(messages) {
            if (hooks.preChat) {
                for (const { run } of hooks.preChat) {
                    messages = await Promise.resolve(run(messages))
                }
            }
            console.log(messages)
            return messages
        },
    }
}
