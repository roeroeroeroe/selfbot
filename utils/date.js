function format(dateString) {
	const iso = new Date(dateString).toISOString();
	return `${iso.substring(0, 10)} ${iso.substring(11, 19)} UTC`;
}

export default {
	format,
};
