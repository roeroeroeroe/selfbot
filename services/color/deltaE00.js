import {
	K_L,
	K_C,
	K_H,
	POWER_25_TO_7,
	DEG_TO_RAD,
	RAD_TO_DEG,
} from './constants.js';

function hPrime(ap, b) {
	if (!ap && !b) return 0;
	let h = Math.atan2(b, ap) * RAD_TO_DEG;
	if (h < 0) h += 360;
	return h;
}
export default function deltaE00(Lab1, Lab2) {
	const { L: L1, a: a1, b: b1 } = Lab1;
	const { L: L2, a: a2, b: b2 } = Lab2;

	const C1 = Math.sqrt(a1 ** 2 + b1 ** 2);
	const C2 = Math.sqrt(a2 ** 2 + b2 ** 2);
	const Cbar7 = ((C1 + C2) / 2) ** 7;

	const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POWER_25_TO_7)));

	const a1p = (1 + G) * a1;
	const a2p = (1 + G) * a2;
	const C1p = Math.sqrt(a1p ** 2 + b1 ** 2);
	const C2p = Math.sqrt(a2p ** 2 + b2 ** 2);

	const h1p = hPrime(a1p, b1);
	const h2p = hPrime(a2p, b2);

	const deltaLp = L2 - L1;
	const deltaCp = C2p - C1p;

	let deltaHp;
	if (!C1p || !C2p) deltaHp = 0;
	else {
		let dh = h2p - h1p;
		if (Math.abs(dh) > 180) {
			if (dh > 180) dh -= 360;
			else dh += 360;
		}
		deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * DEG_TO_RAD) / 2);
	}
	const Lbarp = (L1 + L2) / 2;
	const Cbarp = (C1p + C2p) / 2;

	let hbarp;
	if (!C1p || !C2p) hbarp = h1p + h2p;
	else {
		let sumH = h1p + h2p;
		if (Math.abs(h1p - h2p) > 180) {
			if (sumH < 360) sumH += 360;
			else sumH -= 360;
		}
		hbarp = sumH / 2;
	}

	const T =
		1 -
		0.17 * Math.cos((hbarp - 30) * DEG_TO_RAD) +
		0.24 * Math.cos(2 * hbarp * DEG_TO_RAD) +
		0.32 * Math.cos((3 * hbarp + 6) * DEG_TO_RAD) -
		0.2 * Math.cos((4 * hbarp - 63) * DEG_TO_RAD);

	const deltaTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
	const Cbarp7 = Cbarp ** 7;
	const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POWER_25_TO_7));
	const RT = -Math.sin(2 * deltaTheta * DEG_TO_RAD) * RC;

	const SL =
		1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
	const SC = 1 + 0.045 * Cbarp;
	const SH = 1 + 0.015 * Cbarp * T;

	const deltaLp_SL = deltaLp / (K_L * SL);
	const deltaCp_SC = deltaCp / (K_C * SC);
	const deltaHp_SH = deltaHp / (K_H * SH);

	return Math.sqrt(
		deltaLp_SL ** 2 +
			deltaCp_SC ** 2 +
			deltaHp_SH ** 2 +
			RT * deltaCp_SC * deltaHp_SH
	);
}
