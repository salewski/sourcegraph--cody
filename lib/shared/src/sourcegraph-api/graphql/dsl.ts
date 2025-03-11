// Caveats:
// - The object iteration order of versioned fields (versionGte) is different depending on
//   whether the predicate passed or failed.
// - Does not support fragments (for example "... on FileChunkContext") yet.
// - Only supports a subset of types for early configuration, for example, not [ID!]! which getCodyContext uses.
// - Does not support mutations yet.

import assert from 'node:assert'
// A field with a primitive type or an anonymous object type.
import _ from 'lodash'
import semver from 'semver'

export interface ValueSpec<Name extends string, T> {
    kind: 'value'
    name: Name
}

// Objects are not primitive types, but [FieldSpec<f1,T1>, FieldSpec<f2,T2>, ...].
export interface ObjectSpec<Name extends string, T extends SomeFields> {
    kind: 'object'
    name: Name
    fields: T
}

export interface ArraySpec<Name extends string, T extends SomeFields> {
    kind: 'array'
    name: Name
    fields: T
}

// A literal value. These are supplied as arguments.
export interface Constant<Name extends string, T> {
    kind: 'constant'
    name: Name
    value: T
}

// A constant value. For an enum constant such as codyContextFilters(version:V1) use `constant('version', Symbol('V1'))`.
// 🚨 SECURITY: Do not use untrusted input for symbol names. These are not escaped and could be used in query injection.
export function constant<Name extends string, T>(name: Name, value: T): Constant<Name, T> {
    return {
        kind: 'constant',
        name,
        value,
    }
}

// The formal parameters of a GraphQL field.
interface Formal<Name extends string, T> {
    kind: 'formal'
    name: Name
    // The GraphQL type to declare for this parameter. Feel free to extend this union.
    gqlType: 'Int!' | 'String!' | 'String'
}

export const formal = {
    int<Name extends string>(name: Name): Formal<Name, number> {
        return {
            kind: 'formal',
            name,
            gqlType: 'Int!',
        }
    },
    nullableString<Name extends string>(name: Name): Formal<Name, string | null> {
        return {
            kind: 'formal',
            name,
            gqlType: 'String',
        }
    },
    string<Name extends string>(name: Name): Formal<Name, string> {
        return {
            kind: 'formal',
            name,
            gqlType: 'String!',
        }
    },
}

type SomeArg = Constant<any, any> | Formal<any, any>

export interface WithArguments<F extends SomeFieldExceptArguments, T extends SomeArg[]> {
    kind: 'args'
    name: F['name']
    field: F
    args: T
}

export function args<
    Formals extends (Constant<any, any> | Formal<any, any>)[],
    Field extends SomeFieldExceptArguments,
>(field: Field, ...argz: Formals): WithArguments<Field, Formals> {
    return {
        kind: 'args',
        // Forward the wrapped field's name.
        name: field.name,
        field,
        args: argz,
    }
}

// Labels a field to rename it.
export interface Labeled<Name extends string, F extends SomeUnlabeledField> {
    kind: 'labeled'
    name: Name
    field: F
}

export function labeled<Name extends string, F extends SomeUnlabeledField>(
    name: Name,
    field: F
): Labeled<Name, F> {
    return {
        kind: 'labeled',
        name,
        field,
    }
}

export interface VersionPredicate<F extends SomeField> {
    kind: 'versionPredicate'
    name: F['name']
    version: string
    field: F
    defaultValue: RealizeField<F>
}

export function versionGte<F extends SomeField>(
    version: string,
    defaultValue: RealizeField<F>,
    field: F
): VersionPredicate<F> {
    return {
        kind: 'versionPredicate',
        name: field.name,
        version,
        field,
        defaultValue,
    }
}

// In general, don't use these; always use (or infer) specific types. SomeField and
// SomeFields cut down stuttering the list of all field types. We can't use a parent type
// and have ValueSpec extends FieldSpec, ObjectSpec extends FieldSpec, ... because such a parent
// type is not closed: We need our handling to be exhaustive.
type SomeFieldExceptArguments = ValueSpec<any, any> | ObjectSpec<any, any> | ArraySpec<any, any>
type SomeUnlabeledField = SomeFieldExceptArguments | WithArguments<SomeFieldExceptArguments, any>
type SomeUnversionedField = SomeUnlabeledField | Labeled<any, SomeUnlabeledField>
type SomeField = SomeUnversionedField | VersionPredicate<SomeUnversionedField>
type SomeFields = SomeField[]

// Creates a field spec. TypeScript does not have partial application of type parameters,
// so the function is curried so that we can specify the field type but use type inference
// for the field name. For example:
// field<string>()('username') : FieldSpec<'username',string>.
export function field<T>(): <Name extends string>(name: Name) => ValueSpec<Name, T> {
    return <Name extends string>(name: Name) => ({
        kind: 'value',
        name,
    })
}

// A single nested object. Use array for arrays of nested objects.
export function nested<Name extends string, T extends SomeFields>(
    name: Name,
    ...fields: T
): ObjectSpec<Name, T> {
    return {
        kind: 'object',
        name,
        fields,
    }
}

// An array of nested objects. For primitive arrays, use the regular type for example number[].
export function array<Name extends string, T extends SomeFields>(
    name: Name,
    ...fields: T
): ArraySpec<Name, T> {
    return {
        kind: 'array',
        name,
        fields,
    }
}

// A list of fields, for top-level queries.
export function fields<T extends SomeFields>(...specs: T) {
    return { specs }
}

// Realizes a TypedName as a concrete type the result will have. For example:
// Realize<[ValueSpec<"id",number>,ValueSpec<"name",string>] => {"id":number, "name":string}
export type Realize<T extends SomeFields> = {
    // Extract<T[number], { name: K }> seems redundant given K is already bound, but
    // T[number] is quantified over all fields, and we want to infer a field type U for each
    // *specific* field. Extract<T[number], { name: K }> indexes the specific field.
    [K in T[number]['name']]: RealizeField<Extract<T[number], { name: K }>>
}

// Handles realizing the single type of some field.
export type RealizeField<F extends SomeField> = F extends ObjectSpec<any, any>
    ? Realize<F['fields']>
    : F extends ArraySpec<any, any>
      ? Realize<F['fields']>[]
      : F extends WithArguments<infer U, any>
        ? RealizeField<U>
        : F extends Labeled<any, infer U>
          ? RealizeField<U>
          : F extends VersionPredicate<infer U>
            ? RealizeField<U>
            : F extends ValueSpec<any, infer U>
              ? U
              : never

// Collects the types of arguments.
export type Arguments<F extends SomeField> = F extends ArraySpec<any, any>
    ? ArgumentsOfN<F['fields']>
    : F extends ObjectSpec<any, any>
      ? ArgumentsOfN<F['fields']>
      : F extends Labeled<any, infer G>
        ? Arguments<G>
        : F extends WithArguments<infer G, infer Args>
          ? [...Args, ...Arguments<G>]
          : F extends VersionPredicate<infer G>
            ? Arguments<G>
            : F extends ValueSpec<any, any>
              ? []
              : never

export type ArgumentsOfN<T extends SomeFields> = T extends [infer Head, ...infer Tail]
    ? // Head and Tail are always SomeField : SomeFields because T extends SomeFields
      // but TypeScript seems unable to prove this, so we must reassure it.
      Head extends SomeField
        ? Tail extends SomeFields
            ? [...Arguments<Head>, ...ArgumentsOfN<Tail>]
            : never
        : never
    : []

export type ActualTypes<T extends SomeArg[]> = T extends [infer Head, ...infer Tail]
    ? Head extends SomeArg
        ? Tail extends SomeArg[]
            ? [...ActualTypesOfArg<Head>, ...ActualTypes<Tail>]
            : never
        : never
    : []

export type ActualTypesOfArg<T extends SomeArg> = T extends Formal<any, infer ArgT> ? [ArgT] : []

// Visible for testing.
export function collectFormals<F extends SomeField>(field: F): Arguments<F> {
    // We give up on TypeScript types here an assert as Arguments<F>, claiming that the
    // recursion on the types in Arguments and on the values in collectFormals is equivalent.
    // The reason is simply switching on field.kind === 'args', for example, ensures
    // field: WithArguments<?,?> but without knowledge of F these are existentials.
    // We can't extract detail from F: Extract<F, ...> would be the way to do that, but Extract is
    // only valid in an extends clause; the extends clause must handle failure; a type predicate
    // must be assignable to the parameter type.
    switch (field.kind) {
        case 'args':
            return [
                ...field.args.filter((arg: SomeArg) => arg.kind === 'formal'),
                ...collectFormals(field.field),
            ] as Arguments<F>
        case 'array':
        case 'object':
            return collectFormalList(field.fields) as Arguments<F>
        case 'labeled':
        case 'versionPredicate':
            return collectFormals(field.field) as Arguments<F>
        case 'value':
            return [] as Arguments<F>
    }
}

// Visible for testing.
export function collectFormalList<F extends SomeFields>(fields: F): ArgumentsOfN<F> {
    return (
        fields.length === 0 ? [] : [...collectFormals(fields[0]), ...collectFormalList(fields.slice(1))]
    ) as ArgumentsOfN<F>
}

// Our classic approach: Text with no typing:
// query Repositories($first: Int!, $after: String, $query: String) {
//     repositories(first: $first, after: $after, query: $query) {
//         nodes {
//             id
//             name
//         }
//         pageInfo {
//             endCursor
//         }
//     }
// }

// New approach: Combinators *with* types.
export const q = {
    boolean: field<boolean>(),
    string: field<string>(),
    number: field<number>(),
}

export function both<T extends SomeField, U extends SomeField>(a: T, b: U) {
    return [a, b]
}

interface FieldPath {
    field: SomeField
    parent: FieldPath | undefined
}

// Instructions to set a default value. We do enforce that default values match
// the type of the fields they are replacing, but we do not prove that the types
// are carried through to the final result. The exact set of defaults depends on
// SiteProductVersion at runtime. We could use type indices to do this in a
// typed way, but for now we simply build an untyped list of instructions to set
// the default values at runtime and assert that the types are correct.
interface DefaultValueSetter {
    path: FieldPath
    value: any
}

// Prepares a single field in a query. This depends on the runtime version of
// the site (if known) and mutates its arguments to accumulate:
// - query text (buffer)
// - formal arguments (formals)
// - default values (defaults) to apply given the product version
// - the path to the field being serialized (path)
function serializeField<T extends SomeField>(
    realVersion: string,
    buffer: string[],
    formals: Formal<any, any>[],
    defaults: DefaultValueSetter[],
    path: FieldPath
): boolean {
    const field = path.field
    switch (field.kind) {
        case 'args': {
            buffer.push(field.name, '(')
            for (const arg of field.args) {
                buffer.push(arg.name, ':')
                switch (arg.kind) {
                    case 'formal': {
                        // Gensym unique argument names.
                        const renaming = `\$${arg.name}${formals.length}`
                        formals.push({
                            ...arg,
                            name: renaming,
                        })
                        buffer.push(renaming)
                        break
                    }
                    case 'constant':
                        buffer.push(
                            typeof arg.value === 'symbol'
                                ? arg.value.description
                                : JSON.stringify(arg.value)
                        )
                        break
                }
                buffer.push(',')
            }
            buffer.push(')')
            const subExpr = serializeField(realVersion, buffer, formals, defaults, {
                field: field.field,
                parent: path,
            })
            assert(subExpr, 'arguments must modify some realized field expression')
            return true
        }
        case 'array':
        case 'object':
            if (path.parent?.field.kind !== 'args') {
                // We model objects and arrays as a typed name to keep the type parameters
                // for field names and types together. GraphQL syntax puts arguments after
                // field names, for example repository(name: $name42: String, ...), hence this
                // quirk of checking if the parent is args which already generated the name.
                buffer.push(field.name)
            }
            buffer.push('{')
            for (const child of field.fields) {
                if (
                    serializeField(realVersion, buffer, formals, defaults, {
                        field: child,
                        parent: path,
                    })
                ) {
                    buffer.push(',')
                }
            }
            buffer.push('}')
            return true
        case 'value':
            if (path.parent?.field.kind !== 'args') {
                buffer.push(field.name)
            }
            return true
        case 'labeled': {
            console.assert(path.parent?.field.kind !== 'args') // The SomeXField types prevent this, but we rely on it here.
            buffer.push(field.name, ':')
            const subExpr = serializeField(realVersion, buffer, formals, defaults, {
                field: field.field,
                parent: path,
            })
            assert(subExpr, 'labeled fields must label some realized field expression')
            return true
        }
        case 'versionPredicate':
            console.assert(path.parent?.field.kind !== 'args') // The SomeXField types prevent this, but we rely on it here.
            if (realVersion && semver.lt(realVersion, field.version)) {
                defaults.push({ path, value: field.defaultValue })
                return false
            }
            return serializeField(realVersion, buffer, formals, defaults, {
                field: field.field,
                parent: path,
            })
        default:
            throw new Error('unreachable')
    }
}

export type PreparedQuery<T extends SomeFields> = {
    // The abstract query that was prepared; use this for the type of the result for example Realize<typeof prepared.query>.
    query: T
    // The yield of the query to send to the GraphQL endpoint.
    text: string | null
    // The list of formal parameters to the query that need to be provided. Formals are alpha renamed to avoid collisions.
    formals: Formal<any, any>[]
    // Pairs of property paths, values to set as defaults for fields missing in this product version.
    defaults: DefaultValueSetter[]
}

function pathEntriesTopDown(path: FieldPath): SomeField[] {
    const result: SomeField[] = []
    for (let step: FieldPath | undefined = path; step; step = step.parent) {
        result.push(step.field)
    }
    result.reverse()
    return result
}

// Converts a FieldPath into a list of property names. The list of property
// names may be smaller than the path itself. For example, a version-predicate
// labeled object field will have three steps--version predicate, label, object
// --but only one property name (specified by the label.)
function pathToPropertyNames(path: FieldPath): string[] {
    const names: string[] = []
    let labeled = false // this flag, if set, skips names until we have seen an actual object/array/etc.
    for (const step of pathEntriesTopDown(path)) {
        console.log(`considering path ${step.kind} ${step.name}`)
        switch (step.kind) {
            case 'args':
                break
            case 'array':
            case 'object':
            case 'value':
                if (!labeled) {
                    names.push(step.name)
                }
                labeled = false
                break
            case 'labeled':
                if (!labeled) names.push(step.name)
                labeled = true
                break
            case 'versionPredicate':
                names.push(step.name)
                break
            default:
                throw new Error('unreachable')
        }
    }
    return names
}

// Visible for testing. Flattens a list of defaults into readable path name, value pairs.
export function flattenDefaults(defaults: DefaultValueSetter[]): Record<string, any> {
    return Object.fromEntries(
        defaults.map(entry => [pathToPropertyNames(entry.path).join('.'), entry.value])
    )
}

// Applies default values for missing fields in the given object. Use `prepare`
// to produce the defaults for a specific product version, then run a GraphQL
// query and use `applyDefaults` to "update" the result with default values
// for the missing fields. This mutates the object in place.
export function applyDefaults(xs: any, defaults: DefaultValueSetter[]): any {
    for (const entry of defaults) {
        applyDefault(xs, pathEntriesTopDown(entry.path))
    }
    return xs
}

function applyDefault(xs: any, steps: SomeField[]): void {
    let obj = xs
    let labeled = false
    for (const [i, step] of steps.entries()) {
        switch (step.kind) {
            case 'args':
                break
            case 'array': {
                if (!labeled) {
                    obj = obj[step.name]
                }
                labeled = false
                assert(Array.isArray(obj), 'expected array')
                const remaining = steps.slice(i + 1)
                for (const arrayEntry of obj) {
                    console.log(
                        `XXX debug applying ${JSON.stringify(remaining)} to ${JSON.stringify(
                            arrayEntry
                        )}`
                    )
                    applyDefault(arrayEntry, remaining)
                    console.log(`value is now ${JSON.stringify(arrayEntry)}`)
                }
                return
            }
            case 'object':
                if (!labeled) {
                    obj = obj[step.name]
                }
                labeled = false
                break
            // biome-ignore lint/suspicious/noFallthroughSwitchClause: fall through does not happen because assert(false, ...) does not return normally
            case 'value':
                assert(false, 'should not be reached because there is no default value to apply here')
            case 'labeled':
                obj = obj[step.name]
                labeled = true
                break
            case 'versionPredicate':
                // Version predicates are only present when we *failed* the version check.
                assert(!labeled, 'labels must be bound more tightly than version predicates')
                obj[step.name] = _.cloneDeep(step.defaultValue)
                return
            default:
                throw new Error('unreachable')
        }
    }
}

// Prepares a query by producing the textual serialization of the query.
export function prepare<T extends SomeFields>(realVersion: string, ...query: T): PreparedQuery<T> {
    const buffer: string[] = []
    const formals: Formal<any, any>[] = []
    const defaults: DefaultValueSetter[] = []

    for (const field of query) {
        serializeField(realVersion, buffer, formals, defaults, { field, parent: undefined })
    }

    // Wrap the query in query (...args...) { ... }
    const preamble: string[] = []
    preamble.push('query', '(')
    for (const formal of formals) {
        preamble.push(formal.name, ':', formal.gqlType, ',')
    }
    preamble.push(')', '{')
    buffer.unshift(...preamble)
    buffer.push('}')

    const text = buffer.join('')

    return {
        query,
        text: text === 'query(){}' ? null : text,
        formals,
        defaults,
    }
}

export const currentUserId = prepare('0.0.0', nested('currentUser', q.string('id')))
