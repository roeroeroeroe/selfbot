#!/usr/bin/env node

import { writeFile } from 'fs/promises';

const COLOR_NAMES_URL = 'https://unpkg.com/color-name-list/dist/colornames.json';
const MAX_NAME_LENGTH = 100;
const HEX_PATTERN = /^[0-9a-f]{6}$/i;
const OUT_FILE = 'color_names.json';

function fatal(str) { process.stderr.write(str + '\n'); process.exit(1); }

(async () => {
	let res;
	try {
		res = await fetch(COLOR_NAMES_URL);
		if (!res.ok) throw new Error(res.statusText);
	} catch (err) {
		fatal(`fetch: ${err.message}`);
	}

	let json;
	try {
		json = await res.json();
	} catch (err) {
		fatal(`json: ${err.message}`);
	}

	if (!Array.isArray(json)) fatal('not an array');
	if (!json.length) fatal('empty array');

	const colors    = [],
	      seenNames = new Set(),
	      seenHexes = new Set();
	for (let i = 0; i < json.length; i++) {
		const c = json[i];
		if (typeof c !== 'object' || c === null ||
		    typeof c.name !== 'string' || typeof c.hex !== 'string' ||
		    !c.name || !c.hex || c.name.length > MAX_NAME_LENGTH ||
		    seenNames.has(c.name))
			continue;
		if (c.hex[0] === '#') c.hex = c.hex.slice(1);
		if (!HEX_PATTERN.test(c.hex)) continue;
		const lowercased = c.hex.toLowerCase();
		if (seenHexes.has(lowercased)) continue;
		seenNames.add(c.name);
		seenHexes.add(lowercased);
		colors.push({ name: c.name, hex: lowercased });
	}
	if (!colors.length) fatal('no valid colors');

	await writeFile(`./${OUT_FILE}`, JSON.stringify(colors));
})();
