function format(date) {
	const iso = new Date(date).toISOString();
	return `${iso.substring(0, 10)} ${iso.substring(11, 19)} UTC`;
}

export default {
	format,
};
