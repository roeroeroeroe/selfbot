const cooldown = new Map();

function set(key, ttl) {
	const timeout = cooldown.get(key);
	clearTimeout(timeout);
	if (ttl <= 0) {
		cooldown.delete(key);
		return;
	}
	cooldown.set(
		key,
		setTimeout(() => deleteCooldown(key), ttl)
	);
}

function deleteCooldown(key) {
	const timeout = cooldown.get(key);
	if (!timeout) return;
	clearTimeout(timeout);
	cooldown.delete(key);
}

function has(key) {
	return cooldown.has(key);
}

function cleanup() {
	for (const timeout of cooldown.values()) clearTimeout(timeout);
}

export default {
	set,
	delete: deleteCooldown,
	has,
	cleanup,
};
