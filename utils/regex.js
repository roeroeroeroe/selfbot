const tosPatterns = ['racism', 'age', 'homophobia'];

const patterns = {
	invisChars:
		/[\u034f\u2800\u{E0000}\u180e\ufeff\u2000-\u200d\u206D\uDC00\uDB40]/u,
	racism:
		/(?:(?:\b(?<![-=\.])|monka)(?:[Nnñ]|[Ii7]V)|[\/|]\\[\/|])[\s\.]*?[liI1y!j\/|]+[\s\.]*?(?:[GgbB6934Q🅱qğĜƃ၅5\*][\s\.]*?){2,}(?!arcS|l|Ktlw|ylul|ie217|64|\d? ?times)/i,
	age: /(?:(?:i|my age)\s*['’]?\s*(?:am|'m|m| is)\s*(?:under\s*)?(?:less\s*than\s*)?\s*(1[0-4]|([1-9]$|([1-9]\s?(yo|years|years\s old)))|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)($|\s?(yo|years|years\s old))))/i,
	homophobia: /(\s|^)f\s*[ag@а]\s*(g|8)(o|0)*t*/i,
	url: /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
	regexp: /\/(.*?)\/([gimsuy]*)/,
};

function checkMessage(str) {
	for (const p of tosPatterns) if (patterns[p].test(str)) return p;
}

export default {
	patterns,

	checkMessage,
};
