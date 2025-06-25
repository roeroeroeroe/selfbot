function format(dateInput) {
	const iso = new Date(dateInput).toISOString();
	return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

export default {
	format,
};
