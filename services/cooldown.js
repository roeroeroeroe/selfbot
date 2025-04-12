import logger from './logger.js';
const cooldown = new Set();

function set(id, ttl) {
	logger.debug(`[COOLDOWN] setting key ${id} with ttl ${ttl}`);
	cooldown.add(id);
	setTimeout(() => deleteCooldown(id), ttl);
}

function deleteCooldown(id) {
	logger.debug(`[COOLDOWN] deleting key ${id}`);
	cooldown.delete(id);
}

function has(id) {
	return cooldown.has(id);
}

export default {
	set,
	delete: deleteCooldown,
	has,
};
