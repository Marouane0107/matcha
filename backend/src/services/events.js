import { EventEmitter } from 'node:events';
export const events = new EventEmitter();
export const deliver = (userId, event, payload) => events.emit('deliver', userId, event, payload);