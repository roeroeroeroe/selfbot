function format(dateInput) {
	const iso = new Date(dateInput).toISOString();
	return `${iso.substring(0, 10)} ${iso.substring(11, 19)} UTC`;
}

export default {
	format,
};
