const cooldown = new Map();

function set(key, ttl) {
	const id = cooldown.get(key);
	if (id) clearTimeout(id);
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
	const id = cooldown.get(key);
	if (!id) return;
	clearTimeout(id);
	cooldown.delete(key);
}

function has(key) {
	return cooldown.has(key);
}

export default {
	set,
	delete: deleteCooldown,
	has,
};
