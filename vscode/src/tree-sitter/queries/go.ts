import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'
import type { QueryName } from '../queries'

const SINGLE_LINE_TRIGGERS = dedent`
    (struct_type (field_declaration_list ("{") @block_start)) @trigger
    (interface_type ("{") @block_start) @trigger
`

const DOCUMENTABLE_NODES = dedent`
    ; Functions
    ;--------------------------------
    (function_declaration
        name: (identifier) @symbol.function) @range.function

    ; Variables
    ;--------------------------------
    (var_declaration
        (var_spec
            (identifier) @symbol.identifier)) @range.identifier
    (short_var_declaration
        left:
            (expression_list (identifier) @symbol.identifier)) @range.identifier

    ; Types
    ;--------------------------------
    (type_declaration
        (type_spec
            name: (type_identifier) @symbol.identifier)) @range.identifier
    (struct_type
        (_
            (field_declaration
                name: (field_identifier) @symbol.identifier))) @range.identifier
    (interface_type
        (_
            name: (field_identifier) @symbol.identifier)) @range.identifier
`

export const goQueries = {
    [SupportedLanguage.go]: {
        singlelineTriggers: SINGLE_LINE_TRIGGERS,
        intents: '',
        documentableNodes: DOCUMENTABLE_NODES,
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
