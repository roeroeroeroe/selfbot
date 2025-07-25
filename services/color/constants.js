import { BASE16_CHARSET } from '../../utils/utils.js';

export const HASH_CHARCODE = '#'.charCodeAt(0);
export const INVALID_HEX = 0xff;

export const ASCII_TO_HEX = new Uint8Array(128).fill(INVALID_HEX);
for (let i = 48; i < 58; i++) ASCII_TO_HEX[i] = i - 48;
for (let i = 65; i < 71; i++) ASCII_TO_HEX[i] = i - 55;
for (let i = 97; i < 103; i++) ASCII_TO_HEX[i] = i - 87;

export const BYTE_TO_HEX_STRING = new Array(256);
for (let i = 0; i < 256; i++)
	BYTE_TO_HEX_STRING[i] = BASE16_CHARSET[i >> 4] + BASE16_CHARSET[i & 0xf];

export const SRGB_OETF_THRESHOLD = 0.0031308;
export const SRGB_OETF_A = 1.055;
export const SRGB_OETF_B = 0.055;
export const SRGB_OETF_GAMMA = 0.4166666666666667;

export const SRGB_EOTF_LUT = new Float64Array(256);
// sRGB <= 0.04045 (~10.3 in 8-bit)
for (let i = 0; i < 11; i++) SRGB_EOTF_LUT[i] = i / 255 / 12.92;
// sRGB > 0.04045
for (let i = 11; i < 256; i++)
	SRGB_EOTF_LUT[i] = ((i / 255 + 0.055) / 1.055) ** 2.4;

// prettier-ignore
// sRGB, illuminant=D65, observer=2 deg
export const M_XR = 0.4124564, M_XG = 0.3575761, M_XB = 0.1804375,
             M_YR = 0.2126729, M_YG = 0.7151522, M_YB = 0.072175,
             M_ZR = 0.0193339, M_ZG = 0.119192,  M_ZB = 0.9503041,
             INV_M_XR =  3.2404542, INV_M_XG = -1.5371385, INV_M_XB = -0.4985314,
             INV_M_YR = -0.969266,  INV_M_YG =  1.8760108, INV_M_YB =  0.041556,
             INV_M_ZR =  0.0556434, INV_M_ZG = -0.2040259, INV_M_ZB =  1.0572252;
// prettier-ignore
export const Xn_D65 = 0.95047, Yn_D65 = 1.0, Zn_D65 = 1.08883;

export const K_L = 1.0;
export const K_C = 1.0;
export const K_H = 1.0;
export const POWER_25_TO_7 = 25 ** 7;
export const LAB_EPSILON = 0.008856;
export const LAB_KAPPA = 903.3;

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
