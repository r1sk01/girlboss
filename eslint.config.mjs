import js from '@eslint/js'
import globals from 'globals'
import * as espree from 'espree'
import tsParser from '@typescript-eslint/parser'

// noinspection JSUnusedGlobalSymbols
const noopParser = {
    parseForESLint() {
        return {
            ast: espree.parse('', {
                ecmaVersion: 'latest',
                sourceType: 'module',
                range: true,
                loc: true,
                tokens: true,
                comment: true,
            }),
        }
    },
}

export default [
    {
        ignores: ['node_modules/**', 'web/node_modules/**', 'data/**', 'config/**', 'web/dist/**', 'web/.next/**'],
    },
    {
        files: ['**/*.{js,mjs,cjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
                Bun: 'readonly',
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-lonely-if': 'error',
            'no-else-return': ['error', { allowElseIf: false }],
            curly: ['error', 'multi-line', 'consistent'],
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^(?:_|message|user|count|err|error|e|_stderr)$',
                    varsIgnorePattern: '^(?:_|mongoose|botname)$',
                    caughtErrorsIgnorePattern: '^(?:_|err|error|e)$',
                    ignoreRestSiblings: true,
                },
            ],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-prototype-builtins': 'off',
            'no-misleading-character-class': 'off',
            'no-unreachable': 'off',
        },
    },
    {
        files: ['web/src/**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        rules: {},
    },
    {
        files: ['web/styles/**/*.css'],
        languageOptions: {
            parser: noopParser,
        },
        rules: {},
    },
]
