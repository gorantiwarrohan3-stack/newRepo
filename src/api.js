/**
 * API utility for communicating with Flask backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

/**
 * Make API request
 */
async function apiRequest(endpoint, options = {}) {
	const url = `${API_BASE_URL}${endpoint}`;
	const config = {
		headers: {
			'Content-Type': 'application/json',
			...options.headers,
		},
		...options,
	};

	if (config.body && typeof config.body === 'object') {
		config.body = JSON.stringify(config.body);
	}

	try {
		const response = await fetch(url, config);

		// Try to parse JSON, but handle non-JSON responses gracefully
		let data;
		let bodyText;
		try {
			bodyText = await response.text();
			data = bodyText ? JSON.parse(bodyText) : null;
		} catch (parseError) {
			// If JSON parsing fails, use the raw text as the body
			data = null;
		}

		if (!response.ok) {
			// Construct error message from parsed JSON or raw text
			const errorMessage = data?.error || data?.message || bodyText || 'Unknown error';
			const error = new Error(errorMessage);
			error.status = response.status;
			error.statusText = response.statusText;
			error.body = bodyText;
			throw error;
		}

		return data;
	} catch (error) {
		console.error('API request failed:', error);
		throw error;
	}
}

/**
 * Check if user exists by phone number
 */
export async function checkUserExists(phoneNumber) {
	return apiRequest('/api/check-user', {
		method: 'POST',
		body: { phoneNumber },
	});
}

/**
 * Register a new user
 */
export async function registerUser(userData) {
	return apiRequest('/api/register', {
		method: 'POST',
		body: userData,
	});
}

/**
 * Atomically create a new user and record their login history in a single transaction.
 * This ensures both operations succeed or both fail together.
 */
export async function createUserWithLogin(userData) {
	return apiRequest('/api/create-user-with-login', {
		method: 'POST',
		body: userData,
	});
}

/**
 * Record login history
 */
export async function recordLogin(uid, phoneNumber) {
	return apiRequest('/api/login-history', {
		method: 'POST',
		body: { uid, phoneNumber },
	});
}

/**
 * Get login history for a user
 */
export async function getLoginHistory(uid, limit = 50) {
	// Validate and coerce limit to a safe integer
	const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 50, 1000));
	
	// Construct URL with encoded path parameter and query string
	const url = new URL(`/api/login-history/${encodeURIComponent(uid)}`, API_BASE_URL);
	url.searchParams.set('limit', safeLimit.toString());
	
	return apiRequest(url.pathname + url.search, {
		method: 'GET',
	});
}

/**
 * Get user profile
 */
export async function getUserProfile(uid) {
	return apiRequest(`/api/user/${encodeURIComponent(uid)}`, {
		method: 'GET',
	});
}

/**
 * Update user profile
 */
export async function updateUserProfile(uid, userData) {
	return apiRequest(`/api/user/${encodeURIComponent(uid)}`, {
		method: 'PUT',
		body: userData,
	});
}

/**
 * Fetch prasadam offerings
 */
export async function getOfferings(status) {
	const query = status ? `?status=${encodeURIComponent(status)}` : '';
	return apiRequest(`/api/offerings${query}`, {
		method: 'GET',
	});
}

/**
 * Create a new order for an offering
 */
export async function createOrder(uid, offeringId) {
	return apiRequest('/api/orders', {
		method: 'POST',
		body: { uid, offeringId },
	});
}

/**
 * Fetch recent orders for a user
 */
export async function getOrders(uid) {
	return apiRequest(`/api/orders/${encodeURIComponent(uid)}`, {
		method: 'GET',
	});
}

/**
 * Cancel a student order
 */
export async function cancelOrder(orderId, uid) {
	return apiRequest(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
		method: 'POST',
		body: { uid },
	});
}

/**
 * Supply owner: create supply batch
 */
export async function createSupplyBatch(batchData) {
	return apiRequest('/api/supply/batches', {
		method: 'POST',
		body: batchData,
	});
}

/**
 * Supply owner: list supply batches
 */
export async function getSupplyBatches(uid) {
	return apiRequest(`/api/supply/batches/${encodeURIComponent(uid)}`, {
		method: 'GET',
	});
}

/**
 * Supply owner: create future offering announcement
 */
export async function createFutureOffering(data) {
	return apiRequest('/api/supply/future-offerings', {
		method: 'POST',
		body: data,
	});
}

/**
 * Supply owner: list future offerings
 */
export async function getFutureOfferings(uid) {
	return apiRequest(`/api/supply/future-offerings/${encodeURIComponent(uid)}`, {
		method: 'GET',
	});
}

/**
 * Supply owner: publish a future offering as a live offering
 */
export async function publishFutureOffering(data) {
	return apiRequest('/api/supply/offerings/publish', {
		method: 'POST',
		body: data,
	});
}

/**
 * Supply owner: list live offerings
 */
export async function getSupplyLiveOfferings(uid) {
	return apiRequest(`/api/supply/offerings/${encodeURIComponent(uid)}`, {
		method: 'GET',
	});
}

/**
 * Supply owner: update a live offering
 */
export async function updateSupplyOffering(offeringId, data) {
	return apiRequest(`/api/supply/offerings/${encodeURIComponent(offeringId)}`, {
		method: 'PUT',
		body: data,
	});
}

/**
 * Supply owner: list recent orders
 */
export async function getSupplyOrders(uid, limit = 50) {
	const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 50, 200));
	return apiRequest(`/api/supply/orders/${encodeURIComponent(uid)}?limit=${safeLimit}`, {
		method: 'GET',
	});
}

/**
 * Supply owner: analytics metrics
 */
export async function getSupplyAnalytics(uid) {
	return apiRequest(`/api/supply/analytics/${encodeURIComponent(uid)}`, {
		method: 'GET',
	});
}

/**
 * Supply owner: validate order QR
 */
export async function validateOrderQr(data) {
	return apiRequest('/api/orders/validate', {
		method: 'POST',
		body: data,
	});
}

/**
 * Supply owner: generate custom QR code
 */
export async function createCustomQr(data) {
	return apiRequest('/api/qrcodes', {
		method: 'POST',
		body: data,
	});
}

/**
 * Supply owner: list generated QR codes
 */
export async function getCustomQrCodes(uid) {
	return apiRequest(`/api/qrcodes/${encodeURIComponent(uid)}`, {
		method: 'GET',
	});
}

/**
 * Update subscription status for a user
 */
export async function updateSubscription({ uid, action, waived }) {
	const body = { uid, action };
	if (typeof waived === 'boolean') {
		body.waived = waived;
	}
	return apiRequest('/api/subscription', {
		method: 'POST',
		body,
	});
}

/**
 * Unregister a user (rollback endpoint for cleanup)
 */
export async function unregisterUser(uid) {
	return apiRequest('/api/unregister', {
		method: 'POST',
		body: { uid },
	});
}

/**
 * Health check
 */
export async function healthCheck() {
	return apiRequest('/health', {
		method: 'GET',
	});
}

