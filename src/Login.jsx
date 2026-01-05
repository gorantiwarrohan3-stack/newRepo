import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { auth, getOrCreateRecaptcha, clearRecaptcha } from './firebase.js';
import { signInWithPhoneNumber, signOut } from 'firebase/auth';
import { checkUserExists, registerUser, recordLogin, createUserWithLogin, unregisterUser } from './api.js';
import { useNavigate } from 'react-router-dom';

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
	const navigate = useNavigate();
	const [mode, setMode] = useState('login'); // 'login' | 'register'
	const [step, setStep] = useState('phone'); // 'phone' | 'otp' | 'complete-registration'
	const [countryCode, setCountryCode] = useState('US');
	const [phoneNumber, setPhoneNumber] = useState('');
	const [otp, setOtp] = useState('');
	const [toast, setToast] = useState(null);
	const [confirmationModal, setConfirmationModal] = useState(null); // { message, onConfirm, onCancel }
	const confirmationRef = useRef(null);
	
	// Registration form state
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [address, setAddress] = useState('');

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

	// Helper to normalize phone number to E.164 format
	function normalizePhoneNumber(phoneNumber, countryCode) {
		const selectedCountry = COUNTRIES.find(c => c.code === countryCode);
		if (!selectedCountry) {
			throw new Error('Invalid country code');
		}
		const normalizedDialCode = selectedCountry.dialCode.replace(/\D/g, '');
		let phoneDigits = phoneNumber.replace(/\D/g, '');
		
		if (phoneDigits.startsWith(normalizedDialCode)) {
			phoneDigits = phoneDigits.substring(normalizedDialCode.length);
		}
		
		phoneDigits = phoneDigits.replace(/^0+/, '');
		return '+' + normalizedDialCode + phoneDigits;
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
			// If user is already authenticated and in complete-registration step, skip OTP
			if (step === 'complete-registration' && auth.currentUser) {
				// User is already authenticated, complete registration directly
				const fullPhone = normalizePhoneNumber(phoneNumber, countryCode);
				await handleRegisterComplete(auth.currentUser.uid, fullPhone);
				return;
			}

			// Validate registration fields if in register mode
			if (mode === 'register') {
				if (!name.trim()) {
					showToast('Please enter your name', 'error');
					return;
				}
				if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
					showToast('Please enter a valid email address', 'error');
					return;
				}
				if (!address.trim()) {
					showToast('Please enter your address', 'error');
					return;
				}
			}

			// Get selected country
			const selectedCountry = COUNTRIES.find(c => c.code === countryCode);
			if (!selectedCountry) {
				showToast('Please select a valid country', 'error');
				return;
			}

			// Normalize phone number to E.164 format
			let fullPhone;
			try {
				fullPhone = normalizePhoneNumber(phoneNumber, countryCode);
			} catch (error) {
				showToast('Please select a valid country', 'error');
				return;
			}

			// Extract phone digits for length validation (remove country code and +)
			const normalizedDialCode = selectedCountry.dialCode.replace(/\D/g, '');
			const phoneDigits = fullPhone.substring(1 + normalizedDialCode.length); // +1 for the '+' prefix
			
			// Validate phone number length after normalization
			if (!phoneDigits || phoneDigits.length < 4 || phoneDigits.length > 15) {
				showToast('Please enter a valid phone number', 'error');
				return;
			}

			// Validate E.164 format
			if (!/^\+\d{10,15}$/.test(fullPhone)) {
				showToast('Invalid phone number format', 'error');
				return;
			}

			// Check if user exists before sending OTP
			if (mode === 'register') {
				// For register mode: check if user already exists
				try {
					const checkResult = await checkUserExists(fullPhone);
					if (checkResult.exists) {
						// Show confirmation modal instead of auto-switching
						setConfirmationModal({
							message: 'Account exists — go to Login?',
							onConfirm: () => {
								setMode('login');
								setConfirmationModal(null);
							},
							onCancel: () => {
								setConfirmationModal(null);
							}
						});
						return;
					}
				} catch (apiError) {
					// If API call fails, continue (API might be down)
					// Log error but don't change UI flow
					console.warn('Could not check user existence before OTP:', apiError);
				}
			} else if (mode === 'login') {
				// For login mode: check if user exists, if not ask them to register
				try {
					const checkResult = await checkUserExists(fullPhone);
					if (!checkResult.exists) {
						// Show confirmation modal instead of auto-switching
						setConfirmationModal({
							message: 'No account found — go to Register?',
							onConfirm: () => {
								setMode('register');
								setStep('phone');
								setConfirmationModal(null);
							},
							onCancel: () => {
								setConfirmationModal(null);
							}
						});
						return;
					}
				} catch (apiError) {
					// If API call fails, continue (API might be down)
					// Log error but don't change UI flow
					console.warn('Could not check user existence before OTP:', apiError);
				}
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
			
			// Get the authenticated user
			const user = auth.currentUser;
			if (!user) {
				showToast('Authentication failed', 'error');
				return;
			}

			const fullPhone = normalizePhoneNumber(phoneNumber, countryCode);

			if (mode === 'register') {
				// Check if user already exists via API (race condition check)
				try {
					const checkResult = await checkUserExists(fullPhone);
					if (checkResult.exists) {
						// Race condition detected: user was created between initial check and OTP verification
						// Sign out the authenticated user since registration cannot proceed
						try {
							await signOut(auth);
						} catch (signOutError) {
							console.warn('Error signing out after race condition:', signOutError);
						}
						
						// Show confirmation modal explaining the situation
						setConfirmationModal({
							message: 'This phone number was registered by another user while you were verifying. Would you like to switch to Login?',
							onConfirm: () => {
								setMode('login');
								setStep('phone');
								setOtp('');
								setConfirmationModal(null);
							},
							onCancel: () => {
								setStep('phone');
								setOtp('');
								setConfirmationModal(null);
							}
						});
						return;
					}
				} catch (apiError) {
					// If API call fails, still allow registration (API might be down)
					console.warn('Could not check user existence:', apiError);
				}
				
				// Registration form is already filled, now complete registration
				await handleRegisterComplete(user.uid, fullPhone);
			} else {
				// Login: check if user exists via API
				try {
					const checkResult = await checkUserExists(fullPhone);
					if (!checkResult.exists) {
						// User doesn't exist - they're already authenticated, just need to complete registration
						showToast('User not found. Please complete your registration.', 'error');
						setMode('register');
						setStep('complete-registration');
						// Keep the phone number filled, but clear OTP
						setOtp('');
						// User is already authenticated, so show registration form directly
						return;
					}
					// User exists - record login history
					await recordLogin(user.uid, fullPhone);
					showToast('Authentication successful!', 'success');
					// Navigate to student dashboard
					navigate('/student');
				} catch (apiError) {
					// Fail fast: Don't allow login if user existence cannot be verified
					console.error('Could not verify user existence:', apiError);
					showToast('Unable to verify account. Please try again later.', 'error');
					// Sign out the authenticated user since we cannot verify their account
					try {
						await signOut(auth);
					} catch (signOutError) {
						console.warn('Error signing out after verification failure:', signOutError);
					}
					// Reset to phone step
					setStep('phone');
					setOtp('');
				}
			}
		} catch (err) {
			showToast(err?.message || 'Invalid OTP', 'error');
			setOtp(''); // Clear input on error
		}
	}

	async function handleRegisterComplete(uid, fullPhone) {
		try {
			// Check if user already exists before registering (final race condition check)
			try {
				const checkResult = await checkUserExists(fullPhone);
				if (checkResult.exists) {
					// Race condition detected: user was created between OTP verification and final registration
					// Sign out the authenticated user since registration cannot proceed
					try {
						await signOut(auth);
					} catch (signOutError) {
						console.warn('Error signing out after race condition:', signOutError);
					}
					
					// Show confirmation modal explaining the situation
					setConfirmationModal({
						message: 'This phone number was registered by another user. Would you like to switch to Login?',
						onConfirm: () => {
							setMode('login');
							setStep('phone');
							setOtp('');
							setConfirmationModal(null);
						},
						onCancel: () => {
							setStep('phone');
							setOtp('');
							setConfirmationModal(null);
						}
					});
					return;
				}
			} catch (apiError) {
				// If API call fails, continue with registration (API might be down)
				console.warn('Could not check user existence before registration:', apiError);
			}

			// Atomically register user and record login history via API
			// This ensures both operations succeed or both fail together
			await createUserWithLogin({
				uid: uid,
				name: name.trim(),
				email: email.trim(),
				phoneNumber: fullPhone,
				address: address.trim(),
			});

			showToast('Registration successful!', 'success');
			// Navigate to student dashboard
			navigate('/student');
		} catch (err) {
			// Handle specific error cases (e.g., API returned error that user already exists)
			if (err.message && err.message.includes('already')) {
				// Race condition detected via API error response
				// Sign out the authenticated user since registration cannot proceed
				try {
					await signOut(auth);
				} catch (signOutError) {
					console.warn('Error signing out after registration error:', signOutError);
				}
				
				// Show confirmation modal explaining the situation
				setConfirmationModal({
					message: 'This phone number was registered by another user. Would you like to switch to Login?',
					onConfirm: () => {
						setMode('login');
						setStep('phone');
						setOtp('');
						setConfirmationModal(null);
					},
					onCancel: () => {
						setStep('phone');
						setOtp('');
						setConfirmationModal(null);
					}
				});
			} else {
				showToast(err?.message || 'Registration failed', 'error');
			}
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
			{confirmationModal && (
				<div className="modal-overlay" onClick={confirmationModal.onCancel}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<div className="modal-message">{confirmationModal.message}</div>
						<div className="modal-actions">
							<button
								type="button"
								className="btn btn-secondary"
								onClick={confirmationModal.onCancel}
							>
								Cancel
							</button>
							<button
								type="button"
								className="btn"
								onClick={confirmationModal.onConfirm}
							>
								Confirm
							</button>
						</div>
					</div>
				</div>
			)}
			<div className="app-shell">
				<div className="card">
					<h1 className="title">Prasadam Connect</h1>
					<p className="subtitle">
						{mode === 'login' ? 'Sign in with your phone number' : 'Create a new account'}
					</p>
					
					{/* Mode toggle */}
					{step === 'phone' && (
						<div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
							<button
								type="button"
								onClick={() => setMode('login')}
								className={`btn btn-secondary ${mode === 'login' ? 'active' : ''}`}
								style={{ flex: 1, fontSize: '14px', padding: '10px' }}
							>
								Login
							</button>
							<button
								type="button"
								onClick={() => setMode('register')}
								className={`btn btn-secondary ${mode === 'register' ? 'active' : ''}`}
								style={{ flex: 1, fontSize: '14px', padding: '10px' }}
							>
								Register
							</button>
						</div>
					)}

					{/* Keep recaptcha-container always in DOM to prevent removal errors */}
					<div id="recaptcha-container" style={{ display: 'none' }} />
					
					{step === 'phone' && mode === 'register' ? (
						<form onSubmit={requestOtp} className="stack">
							<label className="label" htmlFor="name">Full Name</label>
							<input
								id="name"
								type="text"
								placeholder="John Doe"
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="input"
								required
							/>
							<label className="label" htmlFor="email">Email</label>
							<input
								id="email"
								type="email"
								placeholder="john@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="input"
								required
							/>
							<label className="label" htmlFor="address">Address</label>
							<input
								id="address"
								type="text"
								placeholder="Enter your address"
								value={address}
								onChange={(e) => setAddress(e.target.value)}
								className="input"
								required
							/>
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
									required
								/>
							</div>
							<button type="submit" className="btn">Send OTP</button>
						</form>
					) : step === 'phone' ? (
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
					) : step === 'otp' ? (
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
							{mode === 'register' && (
								<p style={{ fontSize: '12px', color: 'var(--muted)', margin: '-8px 0 0 0' }}>
									After verification, your registration will be completed.
								</p>
							)}
							<button type="submit" className="btn">Verify</button>
							<button type="button" onClick={() => { setStep('phone'); setOtp(''); }} className="btn btn-secondary">Back</button>
						</form>
					) : step === 'complete-registration' ? (
						<form onSubmit={requestOtp} className="stack">
							<p style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '12px' }}>
								Your phone number has been verified. Please complete your registration:
							</p>
							<label className="label" htmlFor="name">Full Name</label>
							<input
								id="name"
								type="text"
								placeholder="John Doe"
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="input"
								required
							/>
							<label className="label" htmlFor="email">Email</label>
							<input
								id="email"
								type="email"
								placeholder="john@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="input"
								required
							/>
							<label className="label" htmlFor="address">Address</label>
							<input
								id="address"
								type="text"
								placeholder="Enter your address"
								value={address}
								onChange={(e) => setAddress(e.target.value)}
								className="input"
								required
							/>
							<button type="submit" className="btn">Complete Registration</button>
							<button type="button" onClick={() => { setStep('phone'); setMode('login'); setName(''); setEmail(''); setAddress(''); }} className="btn btn-secondary">Cancel</button>
						</form>
					) : null}
				</div>
			</div>
		</>
	);
}
