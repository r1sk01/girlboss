import { describe, expect, test } from 'bun:test'
import { escapereg, parsecommand } from '../core/parser.js'

describe('escapereg', () => {
    test('escapes regex metacharacters', () => {
        expect(escapereg('a.b*c')).toBe('a\\.b\\*c')
        expect(escapereg('$')).toBe('\\$')
    })

    test('leaves ordinary prefixes untouched', () => {
        expect(escapereg('-')).toBe('-')
    })
})

describe('parsecommand', () => {
    test('returns null for a message that does not start with the prefix', () => {
        expect(parsecommand('hello world', '-')).toBeNull()
        expect(parsecommand('', '-')).toBeNull()
    })

    test('returns just the command when there are no arguments', () => {
        expect(parsecommand('-ping', '-')).toEqual(['-ping'])
        expect(parsecommand('-ping   ', '-')).toEqual(['-ping'])
    })

    test('splits arguments on whitespace', () => {
        expect(parsecommand('-give abc 10', '-')).toEqual(['-give', 'abc', '10'])
    })

    test('keeps quoted arguments intact', () => {
        expect(parsecommand('-nick "big kitty"', '-')).toEqual(['-nick', 'big kitty'])
        expect(parsecommand("-nick 'big kitty'", '-')).toEqual(['-nick', 'big kitty'])
    })

    test('does not treat the other quote character as a terminator', () => {
        expect(parsecommand(`-nick "it's fine"`, '-')).toEqual(['-nick', "it's fine"])
    })

    test('honours backslash escapes', () => {
        expect(parsecommand('-nick big\\ kitty', '-')).toEqual(['-nick', 'big kitty'])
        expect(parsecommand('-nick \\"quoted\\"', '-')).toEqual(['-nick', '"quoted"'])
    })

    test('preserves newlines inside an argument', () => {
        expect(parsecommand('-broadcast true "line one\nline two"', '-')).toEqual([
            '-broadcast',
            'true',
            'line one\nline two',
        ])
    })

    test('works with a regex-significant prefix', () => {
        expect(parsecommand('.ping arg', '.')).toEqual(['.ping', 'arg'])
        expect(parsecommand('xping arg', '.')).toBeNull()
    })

    test('is case insensitive on the prefix match but preserves argument case', () => {
        expect(parsecommand('-Nick BigKitty', '-')).toEqual(['-Nick', 'BigKitty'])
    })
})
