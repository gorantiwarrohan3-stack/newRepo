import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { auth, getOrCreateRecaptcha, clearRecaptcha } from './firebase.js';
import { signInWithPhoneNumber } from 'firebase/auth';

// Common countries with their phone codes
const COUNTRIES = [
	{ code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
	{ code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
	{ code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
	{ code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
	{ code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
	{ code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
	{ code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
	{ code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹' },
	{ code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸' },
	{ code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
	{ code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
	{ code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
	{ code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳' },
	{ code: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷' },
	{ code: 'RU', name: 'Russia', dialCode: '+7', flag: '🇷🇺' },
	{ code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
	{ code: 'AE', name: 'UAE', dialCode: '+971', flag: '🇦🇪' },
	{ code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬' },
	{ code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱' },
	{ code: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪' },
];

export default function Login() {
	const [step, setStep] = useState('phone'); // 'phone' | 'otp'
	const [countryCode, setCountryCode] = useState('US'); // Default to US
	const [phoneNumber, setPhoneNumber] = useState(''); // Phone number without prefix
	const [otp, setOtp] = useState('');
	const [toast, setToast] = useState(null);
	const confirmationRef = useRef(null);

	// Auto-dismiss toast after 3 seconds
	useEffect(() => {
		if (toast) {
			const timer = setTimeout(() => {
				setToast(null);
			}, 3000);
			return () => clearTimeout(timer);
		}
	}, [toast]);

	function showToast(message, type = 'error') {
		setToast({ message, type });
	}

	// Helper to initialize reCAPTCHA when container is available
	const initializeRecaptcha = (containerId) => {
		const tryInitialize = () => {
			const element = document.getElementById(containerId);
			if (element) {
				getOrCreateRecaptcha(containerId);
				return true;
			}
			return false;
		};

		// Try immediately first
		if (tryInitialize()) {
			return undefined; // No cleanup needed
		}

		// Use MutationObserver to watch for DOM changes
		let observer = null;
		let retryCount = 0;
		const maxRetries = 50; // Safety limit to prevent infinite observation

		const checkAndInitialize = () => {
			if (tryInitialize()) {
				if (observer) {
					observer.disconnect();
					observer = null;
				}
				return true;
			}
			retryCount++;
			if (retryCount >= maxRetries) {
				console.warn(`reCAPTCHA container ${containerId} not found after ${maxRetries} mutation observations`);
				if (observer) {
					observer.disconnect();
					observer = null;
				}
			}
			return false;
		};

		// Use MutationObserver to watch for DOM mutations
		observer = new MutationObserver(() => {
			checkAndInitialize();
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
		});

		// Return cleanup function
		return () => {
			if (observer) {
				observer.disconnect();
				observer = null;
			}
		};
	};

	// Initialize reCAPTCHA when component mounts and container is available
	useLayoutEffect(() => {
		const cleanup = initializeRecaptcha('recaptcha-container');
		return () => {
			if (cleanup) cleanup();
			// Clean up on unmount
			clearRecaptcha();
		};
	}, []);

	// Re-initialize reCAPTCHA when returning to phone step
	useLayoutEffect(() => {
		if (step === 'phone') {
			const cleanup = initializeRecaptcha('recaptcha-container');
			return cleanup || undefined;
		}
	}, [step]);

	async function requestOtp(e) {
		e.preventDefault();
		try {
			// Get selected country
			const selectedCountry = COUNTRIES.find(c => c.code === countryCode);
			if (!selectedCountry) {
				showToast('Please select a valid country', 'error');
				return;
			}

			// Validate phone number (digits only, reasonable length)
			const phoneDigits = phoneNumber.replace(/\D/g, '');
			if (!phoneDigits || phoneDigits.length < 7 || phoneDigits.length > 15) {
				showToast('Please enter a valid phone number', 'error');
				return;
			}

			// Combine country code with phone number
			const fullPhone = selectedCountry.dialCode + phoneDigits;

			// Validate E.164 format
			if (!/^\+\d{10,15}$/.test(fullPhone)) {
				showToast('Invalid phone number format', 'error');
				return;
			}

			const recaptcha = getOrCreateRecaptcha('recaptcha-container');
			if (!recaptcha) {
				showToast('reCAPTCHA initialization failed. Please refresh the page.', 'error');
				return;
			}
			const confirmation = await signInWithPhoneNumber(auth, fullPhone, recaptcha);
			confirmationRef.current = confirmation;
			setStep('otp');
			showToast('OTP sent successfully!', 'success');
		} catch (err) {
			showToast(err?.message || 'Failed to send OTP', 'error');
		}
	}

	async function verifyOtp(e) {
		e.preventDefault();
		try {
			if (!confirmationRef.current) {
				showToast('Please request a new OTP', 'error');
				setOtp(''); // Clear input
				return;
			}
			await confirmationRef.current.confirm(otp);
			// Success: auth state updates and App will show Hello World
			showToast('Authentication successful!', 'success');
		} catch (err) {
			showToast(err?.message || 'Invalid OTP', 'error');
			setOtp(''); // Clear input on error
		}
	}

	return (
		<>
			{toast && (
				<div className="toast-container">
					<div className={`toast toast-${toast.type}`}>
						<div className="toast-icon">
							{toast.type === 'success' ? (
								<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M16.7071 5.29289C17.0976 5.68342 17.0976 6.31658 16.7071 6.70711L8.70711 14.7071C8.31658 15.0976 7.68342 15.0976 7.29289 14.7071L3.29289 10.7071C2.90237 10.3166 2.90237 9.68342 3.29289 9.29289C3.68342 8.90237 4.31658 8.90237 4.70711 9.29289L8 12.5858L15.2929 5.29289C15.6834 4.90237 16.3166 4.90237 16.7071 5.29289Z" fill="currentColor"/>
								</svg>
							) : (
								<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
									<path d="M10 6V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
									<path d="M10 14H10.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
								</svg>
							)}
						</div>
						<div className="toast-message">{toast.message}</div>
					</div>
				</div>
			)}
			<div className="app-shell">
				<div className="card">
					<h1 className="title">Prasadam Connect</h1>
					<p className="subtitle">Sign in with your phone number</p>
				{/* Keep recaptcha-container always in DOM to prevent removal errors */}
				<div id="recaptcha-container" style={{ display: 'none' }} />
				{step === 'phone' ? (
					<form onSubmit={requestOtp} className="stack">
						<label className="label" htmlFor="phone">Phone Number</label>
						<div style={{ display: 'flex', gap: '8px' }}>
							<select
								id="country-code"
								value={countryCode}
								onChange={(e) => setCountryCode(e.target.value)}
								className="input"
								style={{ width: '140px', flexShrink: 0 }}
							>
								{COUNTRIES.map(country => (
									<option key={country.code} value={country.code}>
										{country.flag} {country.code} ({country.dialCode})
									</option>
								))}
							</select>
							<input
								id="phone"
								type="tel"
								placeholder="1234567890"
								value={phoneNumber}
								onChange={(e) => setPhoneNumber(e.target.value)}
								className="input"
								style={{ flex: 1 }}
							/>
						</div>
						<button type="submit" className="btn">Send OTP</button>
					</form>
				) : (
					<form onSubmit={verifyOtp} className="stack">
						<label className="label" htmlFor="otp">Enter OTP</label>
						<input
							id="otp"
							type="text"
							inputMode="numeric"
							placeholder="6-digit code"
							value={otp}
							onChange={(e) => setOtp(e.target.value)}
							className="input"
						/>
						<button type="submit" className="btn">Verify</button>
						<button type="button" onClick={() => setStep('phone')} className="btn btn-secondary">Back</button>
					</form>
				)}
			</div>
		</div>
		</>
	);
}


