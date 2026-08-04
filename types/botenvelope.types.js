// noinspection JSUnusedGlobalSymbols
/**
 * Shared Signal envelope shape used across command routing and responses.
 *
 * @typedef {Object} SignalMention
 * @property {string=} uuid
 *
 * @typedef {Object} SignalGroupInfo
 * @property {string=} groupId
 *
 * @typedef {Object} SignalDataMessage
 * @property {string=} message
 * @property {number=} timestamp
 * @property {SignalGroupInfo=} groupInfo
 * @property {SignalMention[]=} mentions
 *
 * @typedef {Object} SignalSentMessage
 * @property {string=} message
 * @property {string=} destinationNumber
 * @property {string=} destinationUuid
 * @property {SignalGroupInfo=} groupInfo
 * @property {SignalMention[]=} mentions
 *
 * @typedef {Object} SignalSyncMessage
 * @property {SignalSentMessage=} sentMessage
 *
 * @typedef {Object} Envelope
 * @property {string=} sourceUuid
 * @property {string=} sourceName
 * @property {string=} sourceNumber
 * @property {number=} timestamp
 * @property {boolean=} isselfcommand
 * @property {SignalDataMessage=} dataMessage
 * @property {SignalSyncMessage=} syncMessage
 */

// Keep as a module for JSDoc import() typedef resolution.
export const __botEnvelopeTypes = true
