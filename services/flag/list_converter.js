import utils from '../../utils/index.js';

function createListConverter(itemConverter, listOptions) {
	const {
		unique,
		errorOnDuplicates,
		separator,
		minItems,
		maxItems,
		itemValidator,
	} = listOptions;

	const minItemsErr = `must contain at least ${minItems} ${utils.format.plural(minItems, 'item')}`,
		maxItemsErr = `must contain at most ${maxItems} ${utils.format.plural(maxItems, 'item')}`;

	if (unique)
		return function (list) {
			if (list === null || !(list = list.trim()))
				return minItems ? [null, minItemsErr] : [[], null];
			const items = list.split(separator);
			if (items.length < minItems) return [null, minItemsErr];
			if (items.length > maxItems) return [null, maxItemsErr];

			const seen = new Set();
			let write = 0;
			for (let read = 0; read < items.length; read++) {
				const [v, err] = itemConverter(items[read]);
				if (err) return [null, `invalid item at index ${read}: ${err}`];
				if (!itemValidator(v))
					return [null, `item at index ${read} failed validation`];
				if (!seen.has(v)) {
					seen.add(v);
					items[write++] = v;
					continue;
				}
				if (errorOnDuplicates)
					return [null, `duplicate item at index ${read}: ${String(v)}`];
			}
			if ((items.length = write) < minItems) return [null, minItemsErr];
			return [items, null];
		};

	return function (list) {
		if (list === null || !(list = list.trim()))
			return minItems ? [null, minItemsErr] : [[], null];
		const items = list.split(separator);
		if (items.length < minItems) return [null, minItemsErr];
		if (items.length > maxItems) return [null, maxItemsErr];

		for (let i = 0; i < items.length; i++) {
			const [v, err] = itemConverter(items[i]);
			if (err) return [null, `invalid item at index ${i}: ${err}`];
			if (!itemValidator(v))
				return [null, `item at index ${i} failed validation`];
			items[i] = v;
		}
		return [items, null];
	};
}

export default {
	create: createListConverter,
};
