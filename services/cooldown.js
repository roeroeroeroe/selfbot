import logger from './logger.js';
const cooldown = new Set();

function set(id, ttl) {
	logger.debug(`[COOLDOWN] setting ${id}, ttl=${ttl}`);
	cooldown.add(id);
	setTimeout(() => deleteCooldown(id), ttl);
}

function deleteCooldown(id) {
	logger.debug('[COOLDOWN] deleting', id);
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
