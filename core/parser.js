/**
 * @param {string} string
 * @returns {string}
 */
export function escapereg(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Splits a raw message into `[command, ...arguments]`.
 *
 * Arguments are whitespace separated, may be wrapped in single or double quotes
 * to preserve spaces, and support backslash escaping. Returns null when the
 * message does not start with the prefix.
 *
 * @param {string} message
 * @param {string} prefix
 * @returns {string[]|null}
 */
export function parsecommand(message, prefix) {
    if (!message) return null
    const reg = new RegExp(`^(${escapereg(prefix)}\\S+)\\s*([\\s\\S]*)$`, 'i')
    const match = message.match(reg)
    if (!match) return null
    const command = match[1].trim()
    const rest = match[2].trim()
    if (!rest) return [command]
    const tokens = []
    let current = ''
    let inQuote = false
    let quoteChar = null
    for (let i = 0; i < rest.length; i++) {
        const c = rest[i]
        if (c === '"' || c === "'") {
            if (!inQuote) {
                inQuote = true
                quoteChar = c
                continue
            } else if (c === quoteChar) {
                inQuote = false
                quoteChar = null
                continue
            }
        }
        if (c === '\\' && i + 1 < rest.length) {
            current += rest[++i]
            continue
        }
        if (c === ' ' && !inQuote) {
            if (current) {
                tokens.push(current)
                current = ''
            }
            continue
        }
        current += c
    }
    if (current) tokens.push(current)
    return [command, ...tokens]
}
