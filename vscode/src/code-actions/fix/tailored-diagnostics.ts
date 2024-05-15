import type * as vscode from 'vscode'
import { getDiagnosticCode } from './utils'

interface TailoredDiagnosticInformation {
    /**
     * Additional instructions to provide the LLM,
     * specific to this diagnostic
     */
    additionalInstructions?: string
    /**
     * The range that we should target.
     * - `provided`: use the range provided by the diagnostic.
     * - `expanded`: expand the range to the nearest function or block.
     * - `top-of-file`: target the top of the file (useful for import diagnostics)
     */
    targetRange: 'expanded' | 'provided' | 'top-of-file'
}

/**
 * A mapping of diagnostic sources + codes to tailored information to provide to the LLM
 */
export const TAILORED_DIAGNOSTICS: Record<string, { [code: string]: TailoredDiagnosticInformation }> = {
    ts: {
        '2322': {
            targetRange: 'provided',
            additionalInstructions: 'Do X or Y',
        },
    },
} as const

/**
 * Given a `diagnostic`, returns tailored information to provide to the LLM
 * to help resolve that diagnostic.
 */
export function getTailoredDiagnosticInformation(
    diagnostic: vscode.Diagnostic
): TailoredDiagnosticInformation | undefined {
    const { source } = diagnostic
    const code = getDiagnosticCode(diagnostic.code)

    if (!source || !code) {
        return
    }

    return TAILORED_DIAGNOSTICS[source][code]
}
