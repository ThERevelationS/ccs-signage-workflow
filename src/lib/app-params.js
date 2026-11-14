const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

// Backend configuration comes from the build. Query-string overrides are read
// once, validated, stripped from the address bar, and never persisted.
const OVERRIDE_PARAMS = ['app_id', 'server_url', 'access_token', 'from_url'];
const LEGACY_STORAGE_KEYS = ['base44_app_id', 'base44_server_url', 'base44_from_url', 'base44_functions_version'];
const TRUSTED_BACKEND_ORIGINS = ['https://base44.app'];
// Written by the SDK itself (auth.setToken) after a real sign-in.
const SDK_TOKEN_STORAGE_KEY = 'base44_access_token';

const toHttpOrigin = (value, base) => {
	if (!value) return null;
	try {
		const url = new URL(value, base);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
	} catch {
		return null;
	}
};

export const resolveServerUrl = (override, { envUrl, pageOrigin, allowOverrides = false } = {}) => {
	const overrideOrigin = toHttpOrigin(override);
	if (overrideOrigin) {
		const trusted = new Set(
			[...TRUSTED_BACKEND_ORIGINS, toHttpOrigin(envUrl, pageOrigin), pageOrigin].filter(Boolean),
		);
		if (allowOverrides || trusted.has(overrideOrigin)) return overrideOrigin;
	}
	return envUrl || null;
};

export const resolveAppId = (override, { envAppId, allowOverrides = false } = {}) => {
	if (allowOverrides && override && /^[A-Za-z0-9_-]{1,64}$/.test(override)) return override;
	return envAppId || null;
};

export const resolveFromUrl = (override, { pageHref, pageOrigin } = {}) => {
	if (override) {
		try {
			const url = new URL(override, pageOrigin);
			if (url.origin === pageOrigin) return url.href;
		} catch {
			// fall through to the current page
		}
	}
	return pageHref;
};

export const resolveFunctionsVersion = (override) => (
	override && /^[A-Za-z0-9._-]{1,64}$/.test(override) ? override : null
);

const readStoredToken = () => {
	try {
		return storage.getItem(SDK_TOKEN_STORAGE_KEY) || null;
	} catch {
		return null;
	}
};

const stripOverrideParams = (urlParams) => {
	if (!OVERRIDE_PARAMS.some((name) => urlParams.has(name))) return;
	OVERRIDE_PARAMS.forEach((name) => urlParams.delete(name));
	const query = urlParams.toString();
	const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
	window.history.replaceState(window.history.state, document.title, newUrl);
};

const clearLegacyStorage = () => {
	LEGACY_STORAGE_KEYS.forEach((key) => {
		try {
			storage.removeItem(key);
		} catch {
			// storage unavailable
		}
	});
};

const getAppParams = () => {
	const env = import.meta.env || {};
	if (isNode) {
		return {
			appId: env.VITE_BASE44_APP_ID || null,
			serverUrl: env.VITE_BASE44_BACKEND_URL || null,
			token: null,
			fromUrl: null,
			functionsVersion: null,
		};
	}
	const allowOverrides = Boolean(env.DEV);
	const pageOrigin = window.location.origin;
	const urlParams = new URLSearchParams(window.location.search);
	const query = Object.fromEntries(OVERRIDE_PARAMS.map((name) => [name, urlParams.get(name)]));
	stripOverrideParams(urlParams);
	clearLegacyStorage();
	return {
		appId: resolveAppId(query.app_id, { envAppId: env.VITE_BASE44_APP_ID, allowOverrides }),
		serverUrl: resolveServerUrl(query.server_url, { envUrl: env.VITE_BASE44_BACKEND_URL, pageOrigin, allowOverrides }),
		// A URL-supplied token lives in memory for this page load only.
		token: query.access_token || readStoredToken(),
		fromUrl: resolveFromUrl(query.from_url, { pageHref: window.location.href, pageOrigin }),
		functionsVersion: resolveFunctionsVersion(urlParams.get('functions_version')),
	};
};


export const appParams = {
	...getAppParams()
}
