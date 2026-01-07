import React, { useEffect, useRef, useState } from 'react';
import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { useLocation, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { Html5Qrcode } from 'html5-qrcode';
import {
	getUserProfile,
	updateUserProfile,
	getOrders,
	createOrder,
	cancelOrder,
	updateSubscription,
	createSupplyBatch,
	getSupplyBatches,
	createFutureOffering,
	getFutureOfferings,
	deleteFutureOffering,
	getSupplyAnalytics,
	getSupplyOrders,
	validateOrderQr,
	createCustomQr,
	getCustomQrCodes,
	publishFutureOffering,
	getSupplyLiveOfferings,
	updateSupplyOffering,
	deleteSupplyOffering,
} from './api.js';

export default function App() {
	const location = useLocation();
	const navigate = useNavigate();
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);

	const [userProfile, setUserProfile] = useState(null);
	const [profileLoading, setProfileLoading] = useState(false);
	const [profileError, setProfileError] = useState(null);

	const [currentPage, setCurrentPage] = useState('home'); // 'home', 'profile', or 'orders'
	const [isEditing, setIsEditing] = useState(false);
	const [editForm, setEditForm] = useState({ name: '', email: '', address: '' });
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState(null);
	const [saveSuccess, setSaveSuccess] = useState(false);

	const [offerings, setOfferings] = useState([]);
	const [offeringsLoading, setOfferingsLoading] = useState(true);
	const [offeringsError, setOfferingsError] = useState(null);
	const offeringsStatusRef = useRef(new Map());
	const initialOfferingsLoad = useRef(true);

	const [orders, setOrders] = useState([]);
	const [ordersLoading, setOrdersLoading] = useState(false);
	const [ordersError, setOrdersError] = useState(null);
	const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
	const [currentOfferingIndex, setCurrentOfferingIndex] = useState(0);

	const [orderingOfferingId, setOrderingOfferingId] = useState(null);
	const [orderError, setOrderError] = useState(null);
	const [selectedOrder, setSelectedOrder] = useState(null);
	const [cancellingOrderId, setCancellingOrderId] = useState(null);
	const [currentOrderIndex, setCurrentOrderIndex] = useState(0);

	const [toast, setToast] = useState(null);

	const [subscriptionUpdating, setSubscriptionUpdating] = useState(false);
	const [subscriptionError, setSubscriptionError] = useState(null);

	// Supply owner portal state
	const [activeSupplyTab, setActiveSupplyTab] = useState('overview');
	const [supplyBatches, setSupplyBatches] = useState([]);
	const [supplyBatchesLoading, setSupplyBatchesLoading] = useState(false);
	const [supplyBatchesError, setSupplyBatchesError] = useState(null);

	const [batchForm, setBatchForm] = useState({
		title: '',
		quantity: '',
		expirationDate: '',
		expirationTime: '',
		notes: '',
	});

	const [futureOfferings, setFutureOfferings] = useState([]);
	const [futureOfferingsLoading, setFutureOfferingsLoading] = useState(false);
	const [futureOfferingsError, setFutureOfferingsError] = useState(null);

	const [liveOfferings, setLiveOfferings] = useState([]);
	const [liveOfferingsLoading, setLiveOfferingsLoading] = useState(false);
	const [liveOfferingsError, setLiveOfferingsError] = useState(null);
	const [announcementForm, setAnnouncementForm] = useState({
		title: '',
		description: '',
		scheduledDate: '',
		scheduledTime: '',
		notes: '',
		showNotesToStudents: false,
	});

	const [supplyOrders, setSupplyOrders] = useState([]);
	const [supplyOrdersLoading, setSupplyOrdersLoading] = useState(false);
	const [supplyOrdersError, setSupplyOrdersError] = useState(null);
	const [ordersSearchQuery, setOrdersSearchQuery] = useState('');
	const [ordersStatusFilter, setOrdersStatusFilter] = useState('all');
	const [ordersWithUserNames, setOrdersWithUserNames] = useState([]);
	const [ordersCurrentPage, setOrdersCurrentPage] = useState(1);
	const ordersPerPage = 5;

	// Pagination for overview cards
	const [overviewAnnouncementsPage, setOverviewAnnouncementsPage] = useState(1);
	const [overviewBatchesPage, setOverviewBatchesPage] = useState(1);
	const [overviewOrdersPage, setOverviewOrdersPage] = useState(1);
	const overviewItemsPerPage = 3;

	const [supplyAnalytics, setSupplyAnalytics] = useState(null);
	const [analyticsLoading, setAnalyticsLoading] = useState(false);
	const [analyticsError, setAnalyticsError] = useState(null);

	const [qrTokenInput, setQrTokenInput] = useState('');
	const [qrValidationResult, setQrValidationResult] = useState(null);
	const [qrValidationError, setQrValidationError] = useState(null);
	const [qrProcessing, setQrProcessing] = useState(false);
	const [validatingOrderId, setValidatingOrderId] = useState(null);
	const [qrScannerActive, setQrScannerActive] = useState(false);
	const [qrScanningError, setQrScanningError] = useState(null);
	const qrScannerRef = useRef(null);
	const html5QrCodeRef = useRef(null);

	const [customQrForm, setCustomQrForm] = useState({
		title: '',
		purpose: '',
		expiresDate: '',
		expiresTime: '',
	});
	const [customQrResult, setCustomQrResult] = useState(null);
	const [customQrError, setCustomQrError] = useState(null);
	const [customQrLoading, setCustomQrLoading] = useState(false);
	const [publishingOfferingId, setPublishingOfferingId] = useState(null);
	const [publishForm, setPublishForm] = useState({ quantity: '', feeCents: '' });
	const [editingOfferingId, setEditingOfferingId] = useState(null);
	const [editingOfferingForm, setEditingOfferingForm] = useState({ quantity: '', status: '', availableDate: '', availableTime: '' });
	const [deletingOfferingId, setDeletingOfferingId] = useState(null);
	const [confirmModal, setConfirmModal] = useState(null);

	const [qrCodes, setQrCodes] = useState([]);
	const [qrCodesLoading, setQrCodesLoading] = useState(false);
	const [qrCodesError, setQrCodesError] = useState(null);

	// Student announcements (future offerings)
	const [studentAnnouncements, setStudentAnnouncements] = useState([]);
	const [announcementsLoading, setAnnouncementsLoading] = useState(false);
	const [announcementsError, setAnnouncementsError] = useState(null);
	const [announcementsCurrentPage, setAnnouncementsCurrentPage] = useState(1);
	const announcementsPerPage = 1;

	const [allOrdersCurrentPage, setAllOrdersCurrentPage] = useState(1);
	const [allOrdersPerPage, setAllOrdersPerPage] = useState(1);

	const isSupplyOwner = userProfile?.role === 'supplyOwner';
	const supplyRoleInitialized = useRef(false);
	// Check if we're on student or supply owner routes
	// Note: React Router matches /student/* and /supply-owner/*, so we check for these prefixes
	// Exclude login pages from route matching
	const isStudentRoute = location.pathname.startsWith('/student') && location.pathname !== '/student/login';
	const isSupplyOwnerRoute = location.pathname.startsWith('/supply-owner') && location.pathname !== '/supply-owner/login';

	useEffect(() => {
		const unsub = onAuthStateChanged(auth, (u) => {
			setUser(u);
			setLoading(false);
		});
		return () => unsub();
	}, []);

	// Redirect unauthenticated users to appropriate login page
	// Only redirect if:
	// 1. Auth state has finished loading (loading === false)
	// 2. User is not authenticated (!user)
	// 3. We're not already on a login page
	useEffect(() => {
		if (loading) return; // Wait for auth state to be determined
		if (user) return; // User is authenticated, no redirect needed
		
		// Don't redirect if already on login page
		if (location.pathname === '/student/login' || location.pathname === '/supply-owner/login') {
			return;
		}
		
		// Redirect to appropriate login page
		if (isSupplyOwnerRoute) {
			navigate('/supply-owner/login', { replace: true });
		} else {
			navigate('/student/login', { replace: true });
		}
	}, [loading, user, isSupplyOwnerRoute, navigate, location.pathname]);

	// Redirect authenticated users based on role and route
	// Only redirect if user is authenticated and profile is loaded
	useEffect(() => {
		if (loading) return; // Wait for auth state
		if (!user) return; // Not authenticated, handled by other useEffect
		if (!userProfile) return; // Profile not loaded yet, wait for it
		
		// Don't redirect if already on login page (shouldn't happen, but safety check)
		if (location.pathname === '/student/login' || location.pathname === '/supply-owner/login') {
			return;
		}

		// If user is a supply owner but on student route, redirect
		if (isSupplyOwner && isStudentRoute) {
			navigate('/supply-owner', { replace: true });
			return;
		}

		// If user is a student but on supply owner route, redirect
		if (!isSupplyOwner && isSupplyOwnerRoute) {
			navigate('/student', { replace: true });
			return;
		}

		// If authenticated and on correct route, no redirect needed
		// Allow navigation within the same route (e.g., /student/profile, /student/home, etc.)
	}, [loading, user, userProfile, isSupplyOwner, isStudentRoute, isSupplyOwnerRoute, navigate, location.pathname]);

	// Auto-dismiss toast notifications
	useEffect(() => {
		if (!toast) return undefined;
		const timer = setTimeout(() => setToast(null), 4000);
		return () => clearTimeout(timer);
	}, [toast]);

	// Track when supply owner mode becomes active
	useEffect(() => {
		if (isSupplyOwner) {
			if (!supplyRoleInitialized.current) {
				setActiveSupplyTab('overview');
				setCurrentPage('home');
				setIsEditing(false);
				supplyRoleInitialized.current = true;
			}
		} else {
			supplyRoleInitialized.current = false;
			setActiveSupplyTab('overview');
		}
	}, [isSupplyOwner]);

	// Fetch user profile when authenticated
	useEffect(() => {
		if (!user?.uid) {
			setUserProfile(null);
			return;
		}

		setProfileLoading(true);
		setProfileError(null);
		getUserProfile(user.uid)
			.then((response) => {
				if (response.success && response.user) {
					setUserProfile(response.user);
					setEditForm({
						name: response.user.name || '',
						email: response.user.email || '',
						address: response.user.address || '',
					});
				} else {
					setProfileError(response.error || 'Failed to load profile');
				}
			})
			.catch((err) => {
				console.error('Error fetching user profile:', err);
				setProfileError(err.message || 'Failed to load profile');
			})
			.finally(() => setProfileLoading(false));
	}, [user]);

	// Sync profile visibility with supply owner tabs
	useEffect(() => {
		if (!isSupplyOwner) {
			return;
		}
		if (activeSupplyTab === 'profile') {
			setCurrentPage('profile');
		} else if (activeSupplyTab !== 'profile') {
			setIsEditing(false);
		}
	}, [isSupplyOwner, activeSupplyTab]);

	// Real-time offerings listener
	useEffect(() => {
		if (!user?.uid) {
			setOfferings([]);
			setOfferingsLoading(false);
			setOfferingsError(null);
			return;
		}

		setOfferingsLoading(true);
		setOfferingsError(null);

		const offeringsRef = collection(db, 'offerings');
		const unsubscribe = onSnapshot(
			offeringsRef,
			(snapshot) => {
				const prevStatuses = new Map(offeringsStatusRef.current);
				const items = [];

				snapshot.forEach((doc) => {
					const data = doc.data() || {};
					const availableAtRaw = data.availableAt;
					const availableAt =
						typeof availableAtRaw?.toDate === 'function'
							? availableAtRaw.toDate()
							: availableAtRaw
								? new Date(availableAtRaw)
								: null;

					items.push({
						id: doc.id,
						title: data.title || 'Prasadam Offering',
						description: data.description || '',
						status: data.status || 'available',
						availableAt,
						availableQuantity: data.availableQuantity ?? null,
						feeCents: data.feeCents ?? 0,	
						launchFeeRefund:
							data.launchFeeRefund === undefined || data.launchFeeRefund === null
								? true
								: Boolean(data.launchFeeRefund),
					});
				});

				items.sort((a, b) => {
					const timeA = a.availableAt ? a.availableAt.getTime() : 0;
					const timeB = b.availableAt ? b.availableAt.getTime() : 0;
					return timeB - timeA;
				});

				const isAvailableStatus = (status) =>
					['available', 'open'].includes((status || '').toLowerCase());

				if (!initialOfferingsLoad.current) {
					snapshot.docChanges().forEach((change) => {
						const id = change.doc.id;
						const data = change.doc.data() || {};
						const status = (data.status || '').toLowerCase();
						const prevStatus = prevStatuses.get(id);

						if (change.type === 'added' && isAvailableStatus(status)) {
							setToast({
								type: 'success',
								message: `New prasadam is ready: ${data.title || 'Fresh prasadam'}`,
							});
						} else if (
							change.type === 'modified' &&
							prevStatus !== status &&
							isAvailableStatus(status)
						) {
							setToast({
								type: 'success',
								message: `Prasadam restocked: ${data.title || 'Fresh prasadam'}`,
							});
						}
					});
				}

				offeringsStatusRef.current = new Map(
					items.map((item) => [item.id, (item.status || '').toLowerCase()])
				);

				snapshot.docChanges().forEach((change) => {
					if (change.type === 'removed') {
						offeringsStatusRef.current.delete(change.doc.id);
					}
				});

				setOfferings(items);
				setOfferingsLoading(false);
				initialOfferingsLoad.current = false;
			},
			(error) => {
				console.error('Error listening to offerings:', error);
				setOfferingsError(error.message || 'Failed to load offerings');
				setOfferingsLoading(false);
			}
		);

		return () => {
			offeringsStatusRef.current.clear();
			initialOfferingsLoad.current = true;
			unsubscribe();
		};
	}, [user]);

	// Orders fetcher
	useEffect(() => {
		if (!user?.uid) {
			setOrders([]);
			setOrdersError(null);
			setOrdersLoading(false);
			return;
		}

		setOrdersLoading(true);
		setOrdersError(null);
		getOrders(user.uid)
			.then((response) => {
				if (response.success) {
					// Ensure all orders have required fields and get offering title if missing
					const ordersWithData = (response.orders || []).map((order) => {
						if (!order.offeringTitle && order.offeringId) {
							const offering = offerings.find((off) => off.id === order.offeringId);
							if (offering) {
								order.offeringTitle = offering.title;
							}
						}
						// Ensure quantity is set
						if (!order.quantity) {
							order.quantity = 1;
						}
						return order;
					});
					setOrders(ordersWithData);
				} else {
					setOrdersError(response.error || 'Failed to load orders');
				}
			})
			.catch((err) => {
				console.error('Error fetching orders:', err);
				setOrdersError(err.message || 'Failed to load orders');
			})
			.finally(() => setOrdersLoading(false));
	}, [user, ordersRefreshKey, offerings]);

	// Reset carousel index when orders change
	useEffect(() => {
		// Filter out cancelled orders for display - never show cancelled orders
		const activeOrders = orders.filter((order) => {
			const status = (order.status || '').toLowerCase();
			return !['cancelled'].includes(status);
		});
		
		if (activeOrders.length > 0) {
			// If current index is out of bounds, reset to valid index
			if (currentOrderIndex >= activeOrders.length) {
				setCurrentOrderIndex(0);
			}
		} else {
			// No active orders, reset to 0
			setCurrentOrderIndex(0);
		}
	}, [orders.length, orders.map(o => o.status).join(',')]); // Depend on orders length and statuses

	// Reset offerings carousel index when offerings change
	useEffect(() => {
		const availableOfferings = offerings.filter((offering) => {
			const availableQuantity =
				typeof offering.availableQuantity === 'number'
					? offering.availableQuantity
					: null;
			const isAvailable =
				['available', 'open'].includes((offering.status || '').toLowerCase()) &&
				(availableQuantity === null || availableQuantity > 0);
			return isAvailable;
		});
		
		if (availableOfferings.length > 0) {
			// If current index is out of bounds, reset to valid index
			if (currentOfferingIndex >= availableOfferings.length) {
				setCurrentOfferingIndex(0);
			}
		} else {
			// No available offerings, reset to 0
			setCurrentOfferingIndex(0);
		}
	}, [offerings.length, offerings.map(o => o.status).join(',')]);

	const formatCurrency = (cents) => {
		const value = Number.isFinite(cents) ? cents : 0;
		return `$${(value / 100).toFixed(2)}`;
	};

	const formatDateTime = (value) => {
		if (!value) return '—';
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return '—';
		return date.toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short',
		});
	};

	const getStatusColorClass = (status) => {
		if (!status) return 'status-pending';
		const statusLower = status.toLowerCase();
		if (statusLower === 'cancelled') return 'status-cancelled';
		if (['collected', 'completed', 'ready'].includes(statusLower)) return 'status-ready';
		if (['pending', 'in-progress', 'processing'].includes(statusLower)) return 'status-pending';
		return 'status-pending';
	};

	const formatStatus = (status) => {
		if (!status) return 'pending';
		return (status || 'pending').replace(/-/g, ' ');
	};

	const getOfferingTitle = (offeringId) =>
		offerings.find((off) => off.id === offeringId)?.title || 'Prasadam offering';

	const handleSignOut = async () => {
		const isOwner = userProfile?.role === 'supplyOwner';
		await signOut(auth);
		if (isOwner) {
			navigate('/supply-owner/login');
		} else {
			navigate('/student/login');
		}
	};

	const handleProfileClick = () => {
		if (isEditing) {
			setIsEditing(false);
			setSaveSuccess(false);
		}
		if (currentPage === 'profile') {
			setCurrentPage('home');
		} else if (currentPage === 'orders') {
			setCurrentPage('home');
		} else {
			setCurrentPage('profile');
		}
	};

	const handleEdit = () => {
		if (userProfile) {
			setEditForm({
				name: userProfile.name || '',
				email: userProfile.email || '',
				address: userProfile.address || '',
			});
		}
		setCurrentPage('profile');
		setIsEditing(true);
		setSaveError(null);
		setSaveSuccess(false);
	};

	const handleCancel = () => {
		setIsEditing(false);
		setSaveError(null);
		setSaveSuccess(false);
		if (userProfile) {
			setEditForm({
				name: userProfile.name || '',
				email: userProfile.email || '',
				address: userProfile.address || '',
			});
		}
	};

	const handleSave = async (e) => {
		e.preventDefault();
		if (!user?.uid) return;
		setSaving(true);
		setSaveError(null);
		setSaveSuccess(false);

		try {
			const response = await updateUserProfile(user.uid, {
				name: editForm.name.trim(),
				email: editForm.email.trim(),
				address: editForm.address.trim(),
			});

			if (response.success && response.user) {
				setUserProfile(response.user);
				setIsEditing(false);
				setSaveSuccess(true);
				setTimeout(() => setSaveSuccess(false), 3000);
			} else {
				const message = response.error || 'Failed to update profile';
				setSaveError(message);
				setToast({ type: 'error', message });
			}
		} catch (err) {
			console.error('Error updating profile:', err);
			const message = err.message || 'Failed to update profile';
			setSaveError(message);
			setToast({ type: 'error', message });
		} finally {
			setSaving(false);
		}
	};

	const handleInputChange = (field, value) => {
		setEditForm((prev) => ({ ...prev, [field]: value }));
	};

	const isoFromDateTime = (dateValue, timeValue) => {
		if (!dateValue) return undefined;
		const time = timeValue && timeValue.trim() ? timeValue : '00:00';
		const isoCandidate = `${dateValue}T${time}`;
		const date = new Date(isoCandidate);
		if (Number.isNaN(date.getTime())) return undefined;
		return date.toISOString();
	};

	const loadSupplyBatches = async (ownerUid = user?.uid) => {
		if (!ownerUid) return;
		setSupplyBatchesLoading(true);
		setSupplyBatchesError(null);
		try {
			const response = await getSupplyBatches(ownerUid);
			if (response?.success) {
				setSupplyBatches(response.batches || []);
			} else {
				setSupplyBatchesError(response?.error || 'Failed to load supply batches');
			}
		} catch (err) {
			console.error('Error loading supply batches:', err);
			setSupplyBatchesError(err?.message || 'Failed to load supply batches');
		} finally {
			setSupplyBatchesLoading(false);
		}
	};

	const loadFutureAnnouncements = async (ownerUid = user?.uid) => {
		if (!ownerUid) return;
		setFutureOfferingsLoading(true);
		setFutureOfferingsError(null);
		try {
			const response = await getFutureOfferings(ownerUid);
			if (response?.success) {
				setFutureOfferings(response.announcements || []);
			} else {
				setFutureOfferingsError(response?.error || 'Failed to load announcements');
			}
		} catch (err) {
			console.error('Error loading announcements:', err);
			setFutureOfferingsError(err?.message || 'Failed to load announcements');
		} finally {
			setFutureOfferingsLoading(false);
		}
	};

	const loadSupplyAnalytics = async (ownerUid = user?.uid) => {
		if (!ownerUid) return;
		setAnalyticsLoading(true);
		setAnalyticsError(null);
		try {
			const response = await getSupplyAnalytics(ownerUid);
			if (response?.success) {
				setSupplyAnalytics(response.metrics || null);
			} else {
				setAnalyticsError(response?.error || 'Failed to load analytics');
			}
		} catch (err) {
			console.error('Error loading analytics:', err);
			setAnalyticsError(err?.message || 'Failed to load analytics');
		} finally {
			setAnalyticsLoading(false);
		}
	};

	const loadCustomQrCodes = async (ownerUid = user?.uid) => {
		if (!ownerUid) return;
		setQrCodesLoading(true);
		setQrCodesError(null);
		try {
			const response = await getCustomQrCodes(ownerUid);
			if (response?.success) {
				setQrCodes(response.qrCodes || []);
			} else {
				setQrCodesError(response?.error || 'Failed to load QR codes');
			}
		} catch (err) {
			console.error('Error loading QR codes:', err);
			setQrCodesError(err?.message || 'Failed to load QR codes');
		} finally {
			setQrCodesLoading(false);
		}
	};

	const loadSupplyOrders = async (ownerUid = user?.uid, limit = 50) => {
		if (!ownerUid) return;
		setSupplyOrdersLoading(true);
		setSupplyOrdersError(null);
		try {
			const response = await getSupplyOrders(ownerUid, limit);
			if (response?.success) {
				const orders = response.orders || [];
				setSupplyOrders(orders);
				
				// Fetch user names for each order
				const ordersWithNames = await Promise.all(
					orders.map(async (order) => {
						if (!order.uid) return { ...order, userName: 'Unknown' };
						try {
							const userResponse = await getUserProfile(order.uid);
							return {
								...order,
								userName: userResponse?.success && userResponse?.user?.name 
									? userResponse.user.name 
									: 'Unknown'
							};
						} catch (err) {
							console.error(`Error fetching user name for order ${order.id}:`, err);
							return { ...order, userName: 'Unknown' };
						}
					})
				);
				setOrdersWithUserNames(ordersWithNames);
			} else {
				setSupplyOrdersError(response?.error || 'Failed to load orders');
			}
		} catch (err) {
			console.error('Error loading supply orders:', err);
			setSupplyOrdersError(err?.message || 'Failed to load orders');
		} finally {
			setSupplyOrdersLoading(false);
		}
	};

	const loadLiveOfferings = async (ownerUid = user?.uid) => {
		if (!ownerUid) return;
		setLiveOfferingsLoading(true);
		setLiveOfferingsError(null);
		try {
			const response = await getSupplyLiveOfferings(ownerUid);
			if (response?.success) {
				setLiveOfferings(response.offerings || []);
			} else {
				setLiveOfferingsError(response?.error || 'Failed to load live offerings');
			}
		} catch (err) {
			console.error('Error loading live offerings:', err);
			setLiveOfferingsError(err?.message || 'Failed to load live offerings');
		} finally {
			setLiveOfferingsLoading(false);
		}
	};

	// Load supply data whenever supply owner logs in
	useEffect(() => {
		if (!isSupplyOwner || !user?.uid) return;
		const ownerUid = user.uid;
		loadSupplyBatches(ownerUid);
		loadFutureAnnouncements(ownerUid);
		loadSupplyAnalytics(ownerUid);
		loadCustomQrCodes(ownerUid);
		loadSupplyOrders(ownerUid);
		loadLiveOfferings(ownerUid);
	}, [isSupplyOwner, user?.uid]);

	// Cleanup QR scanner on unmount
	useEffect(() => {
		return () => {
			if (html5QrCodeRef.current) {
				html5QrCodeRef.current.stop().catch(() => {});
				html5QrCodeRef.current.clear().catch(() => {});
			}
		};
	}, []);

	// Load future offerings for students (announcements)
	useEffect(() => {
		if (!user?.uid || isSupplyOwner) return; // Only for students
		
		setAnnouncementsLoading(true);
		setAnnouncementsError(null);

		// Query without orderBy to avoid index/permission issues, sort in memory
		const announcementsRef = collection(db, 'futureOfferings');
		
		const unsubscribe = onSnapshot(
			announcementsRef,
			(snapshot) => {
				const items = [];
				snapshot.forEach((doc) => {
					const data = doc.data() || {};
					const scheduledAtRaw = data.scheduledAt;
					const scheduledAt =
						typeof scheduledAtRaw?.toDate === 'function'
							? scheduledAtRaw.toDate()
							: scheduledAtRaw
								? new Date(scheduledAtRaw)
								: null;

					// Only show future announcements (not past ones)
					if (scheduledAt && scheduledAt > new Date()) {
						// Check if notes should be shown - handle various boolean representations
						const showNotes = data.showNotesToStudents === true || 
						                 data.showNotesToStudents === 'true' || 
						                 String(data.showNotesToStudents).toLowerCase() === 'true';
						const notesText = data.notes || '';
						items.push({
							id: doc.id,
							title: data.title || 'Upcoming Prasadam',
							description: data.description || '',
							scheduledAt,
							notes: (showNotes && notesText) ? notesText : '',
						});
					}
				});

				// Sort by scheduledAt in ascending order (client-side)
				items.sort((a, b) => {
					const timeA = a.scheduledAt ? a.scheduledAt.getTime() : 0;
					const timeB = b.scheduledAt ? b.scheduledAt.getTime() : 0;
					return timeA - timeB;
				});

				setStudentAnnouncements(items);
				// Reset to first page if current page is out of bounds
				if (announcementsCurrentPage > Math.ceil(items.length / announcementsPerPage) && items.length > 0) {
					setAnnouncementsCurrentPage(1);
				}
				setAnnouncementsLoading(false);
			},
			(error) => {
				console.error('Error listening to announcements:', error);
				setAnnouncementsError(error.message || 'Failed to load announcements. Please ensure Firestore rules allow reading futureOfferings collection.');
				setAnnouncementsLoading(false);
			}
		);

		return () => unsubscribe();
	}, [user?.uid, isSupplyOwner]);

	const handleOrder = async (offering) => {
		if (!user?.uid) return;
		setOrderingOfferingId(offering.id);
		setOrderError(null);
		try {
			const response = await createOrder(user.uid, offering.id);
			if (response.success && response.order) {
				const orderWithTitle = {
					...response.order,
					offeringTitle: offering.title,
				};
				setSelectedOrder(orderWithTitle);
				setToast({
					type: 'success',
					message: `Order confirmed for ${offering.title}`,
				});
				setOrdersRefreshKey((key) => key + 1);
			} else {
				const message = response.error || 'Failed to place order';
				setOrderError(message);
				setToast({ type: 'error', message });
			}
		} catch (err) {
			console.error('Error creating order:', err);
			const message = err.message || 'Failed to place order';
			setOrderError(message);
			setToast({ type: 'error', message });
		} finally {
			setOrderingOfferingId(null);
		}
	};

	const handleShowOrder = (order) => {
		setSelectedOrder({
			...order,
			offeringTitle: order.offeringTitle || getOfferingTitle(order.offeringId),
		});
	};

	const handleCloseOrderModal = () => setSelectedOrder(null);

	const handleCancelOrder = async (orderId) => {
		if (!user?.uid || !orderId) return;
		setCancellingOrderId(orderId);
		try {
			const response = await cancelOrder(orderId, user.uid);
			if (response.success) {
				setToast({
					type: 'success',
					message: 'Order cancelled successfully',
				});
				
				// Update the order in local state immediately and adjust carousel index
				setOrders((prevOrders) => {
					const updatedOrders = prevOrders.map((order) => 
						order.id === orderId 
							? { ...order, status: 'cancelled', cancelledAt: response.order?.cancelledAt }
							: order
					);
					
					// Calculate active orders after the update
					const activeOrders = updatedOrders.filter((o) => {
						const status = (o.status || '').toLowerCase();
						return !['cancelled'].includes(status);
					});
					
					// Reset to first active order (index 0 in filtered list)
					if (activeOrders.length > 0) {
						setCurrentOrderIndex(0);
					} else {
						// All orders cancelled, reset to 0
						setCurrentOrderIndex(0);
					}
					
					return updatedOrders;
				});
				
				// Refresh orders list from server
				setOrdersRefreshKey((key) => key + 1);
				
				// Close order modal if this order was selected
				if (selectedOrder?.id === orderId) {
					setSelectedOrder(null);
				}
			} else {
				const message = response.error || 'Failed to cancel order';
				setToast({ type: 'error', message });
			}
		} catch (err) {
			console.error('Error cancelling order:', err);
			const message = err.message || 'Failed to cancel order';
			setToast({ type: 'error', message });
		} finally {
			setCancellingOrderId(null);
		}
	};

	const handleSubscription = async (action) => {
		if (!user?.uid) return;
		setSubscriptionUpdating(true);
		setSubscriptionError(null);
		try {
			const response = await updateSubscription({
				uid: user.uid,
				action,
				waived:
					action === 'activate'
						? (userProfile?.subscription?.waived ?? true)
						: undefined,
			});

			if (response.success && response.subscription) {
				setUserProfile((prev) =>
					prev ? { ...prev, subscription: response.subscription } : prev
				);
				setToast({
					type: 'success',
					message:
						action === 'activate'
							? 'Subscription activated'
							: 'Subscription cancelled',
				});
			} else {
				const message = response.error || 'Unable to update subscription';
				setSubscriptionError(message);
				setToast({ type: 'error', message });
			}
		} catch (err) {
			console.error('Error updating subscription:', err);
			const message = err.message || 'Unable to update subscription';
			setSubscriptionError(message);
			setToast({ type: 'error', message });
		} finally {
			setSubscriptionUpdating(false);
		}
	};

	const handleCreateBatch = async (e) => {
		e.preventDefault();
		if (!user?.uid) return;
		const payload = {
			uid: user.uid,
			title: batchForm.title.trim(),
			quantity: Number.parseInt(batchForm.quantity, 10),
			expirationAt: isoFromDateTime(batchForm.expirationDate, batchForm.expirationTime),
			notes: batchForm.notes.trim() || undefined,
		};
		if (!payload.quantity || Number.isNaN(payload.quantity) || payload.quantity <= 0) {
			setSupplyBatchesError('Please provide a valid quantity.');
			return;
		}

		setSupplyBatchesError(null);
		setSupplyBatchesLoading(true);
		try {
			const response = await createSupplyBatch(payload);
			if (response?.success) {
				setToast({
					type: 'success',
					message: 'Supply batch recorded.',
				});
				setBatchForm({ title: '', quantity: '', expirationDate: '', expirationTime: '', notes: '' });
				await loadSupplyBatches(user.uid);
			} else {
				const message = response?.error || 'Unable to create supply batch';
				setSupplyBatchesError(message);
				setToast({ type: 'error', message });
			}
		} catch (err) {
			console.error('Error creating supply batch:', err);
			const message = err?.message || 'Unable to create supply batch';
			setSupplyBatchesError(message);
			setToast({ type: 'error', message });
		} finally {
			setSupplyBatchesLoading(false);
		}
	};

	const handleCreateAnnouncement = async (e) => {
		e.preventDefault();
		if (!user?.uid) return;

		const payload = {
			uid: user.uid,
			title: announcementForm.title.trim(),
			description: announcementForm.description.trim(),
			scheduledAt: isoFromDateTime(announcementForm.scheduledDate, announcementForm.scheduledTime),
			notes: announcementForm.notes.trim() || undefined,
			showNotesToStudents: Boolean(announcementForm.showNotesToStudents), // Explicitly convert to boolean
		};

		if (!payload.scheduledAt) {
			setFutureOfferingsError('Please provide both date and time for the scheduled availability.');
			return;
		}

		setFutureOfferingsError(null);
		setFutureOfferingsLoading(true);
		try {
			const response = await createFutureOffering(payload);
			if (response?.success) {
				setToast({
					type: 'success',
					message: 'Future offering scheduled.',
				});
				setAnnouncementForm({ title: '', description: '', scheduledDate: '', scheduledTime: '', notes: '', showNotesToStudents: false });
				await loadFutureAnnouncements(user.uid);
			} else {
				const message = response?.error || 'Unable to create announcement';
				setFutureOfferingsError(message);
				setToast({ type: 'error', message });
			}
		} catch (err) {
			console.error('Error creating announcement:', err);
			const message = err?.message || 'Unable to create announcement';
			setFutureOfferingsError(message);
			setToast({ type: 'error', message });
		} finally {
			setFutureOfferingsLoading(false);
		}
	};

	const handleStartQrScanner = async () => {
		try {
			setQrScanningError(null);
			setQrScannerActive(true);
			
			// Create Html5Qrcode instance
			const html5QrCode = new Html5Qrcode("qr-reader");
			html5QrCodeRef.current = html5QrCode;
			
			// Helper function to start scanning with a specific camera config
			const startScanning = async (cameraConfig) => {
				return html5QrCode.start(
					cameraConfig,
					{
						fps: 10,
						qrbox: { width: 250, height: 250 },
					},
					(decodedText) => {
						// Successfully scanned QR code
						setQrTokenInput(decodedText);
						handleStopQrScanner();
					},
					(errorMessage) => {
						// Ignore scan errors (they're frequent while scanning)
					}
				);
			};
			
			// Try back camera first (best for mobile), then fall back to front camera (desktop webcam)
			try {
				await startScanning({ facingMode: "environment" }); // Back camera (mobile)
			} catch (envErr) {
				// If back camera fails, try front camera (desktop webcam)
				try {
					await startScanning({ facingMode: "user" }); // Front camera (desktop)
				} catch (userErr) {
					// Both cameras failed
					setQrScanningError('Failed to access camera. Please ensure you have a camera connected and have granted camera permissions.');
					setQrScannerActive(false);
					if (html5QrCodeRef.current) {
						html5QrCodeRef.current = null;
					}
				}
			}
		} catch (err) {
			console.error('Error starting QR scanner:', err);
			setQrScanningError(err.message || 'Failed to access camera. Please ensure you have a camera connected and have granted camera permissions.');
			setQrScannerActive(false);
		}
	};

	const handleStopQrScanner = async () => {
		try {
			if (html5QrCodeRef.current) {
				await html5QrCodeRef.current.stop();
				await html5QrCodeRef.current.clear();
				html5QrCodeRef.current = null;
			}
		} catch (err) {
			console.error('Error stopping QR scanner:', err);
		} finally {
			setQrScannerActive(false);
			setQrScanningError(null);
		}
	};

	const handleValidateQrToken = async (e) => {
		e.preventDefault();
		if (!user?.uid) return;
		const qrToken = qrTokenInput.trim();
		if (!qrToken) {
			setQrValidationError('Please enter a QR token.');
			return;
		}
		setQrProcessing(true);
		setQrValidationError(null);
		setQrValidationResult(null);
		try {
			const response = await validateOrderQr({ uid: user.uid, qrToken });
			if (response?.success) {
				setQrValidationResult(response.order);
				setToast({
					type: 'success',
					message: 'QR code validated. Order marked as collected.',
				});
				setOrdersRefreshKey((key) => key + 1);
				await loadSupplyAnalytics(user.uid);
			} else {
				const message = response?.error || 'Unable to validate QR code';
				setQrValidationError(message);
				setToast({ type: 'error', message });
			}
		} catch (err) {
			console.error('Error validating QR code:', err);
			const message = err?.message || 'Unable to validate QR code';
			setQrValidationError(message);
			setToast({ type: 'error', message });
		} finally {
			setQrProcessing(false);
		}
	};

	const handleValidateOrder = async (order) => {
		if (!user?.uid || !order?.qrToken) return;
		setValidatingOrderId(order.id);
		try {
			const response = await validateOrderQr({ uid: user.uid, qrToken: order.qrToken });
			if (response?.success) {
				setToast({
					type: 'success',
					message: 'Order validated and marked as collected.',
				});
				setOrdersRefreshKey((key) => key + 1);
				await loadSupplyAnalytics(user.uid);
				await loadSupplyOrders(user.uid);
			} else {
				const message = response?.error || 'Unable to validate order';
				setToast({ type: 'error', message });
			}
		} catch (err) {
			console.error('Error validating order:', err);
			const message = err?.message || 'Unable to validate order';
			setToast({ type: 'error', message });
		} finally {
			setValidatingOrderId(null);
		}
	};

	const handleGenerateCustomQr = async (e) => {
		e.preventDefault();
		if (!user?.uid) return;
		setCustomQrLoading(true);
		setCustomQrError(null);
		setCustomQrResult(null);

		const payload = {
			uid: user.uid,
			title: customQrForm.title.trim(),
			purpose: customQrForm.purpose.trim(),
			expiresAt: isoFromDateTime(customQrForm.expiresDate, customQrForm.expiresTime),
		};

		try {
			const response = await createCustomQr(payload);
			if (response?.success) {
				setCustomQrResult(response.qrCode);
				setToast({
					type: 'success',
					message: 'Custom QR code generated.',
				});
				setCustomQrForm({ title: '', purpose: '', expiresDate: '', expiresTime: '' });
				await loadCustomQrCodes(user.uid);
			} else {
				const message = response?.error || 'Unable to generate QR code';
				setCustomQrError(message);
				setToast({ type: 'error', message });
			}
		} catch (err) {
			console.error('Error generating custom QR:', err);
			const message = err?.message || 'Unable to generate QR code';
			setCustomQrError(message);
			setToast({ type: 'error', message });
		} finally {
			setCustomQrLoading(false);
		}
	};

	const handleSupplyTabChange = (tab) => {
		setActiveSupplyTab(tab);
		setQrValidationError(null);
		setQrValidationResult(null);
		// Stop QR scanner if active when switching tabs
		if (qrScannerActive) {
			handleStopQrScanner();
		}
		if (tab !== 'qr') {
			setQrTokenInput('');
		}
		if (tab !== 'profile') {
			setCustomQrResult(null);
		}
		// Reset inline edit/publish state when switching tabs
		setPublishingOfferingId(null);
		setPublishForm({ quantity: '', feeCents: '' });
		setEditingOfferingId(null);
		setEditingOfferingForm({ quantity: '', status: '' });
		// Reset pagination when switching tabs
		if (tab === 'orders') {
			setOrdersCurrentPage(1);
		}
		if (tab === 'overview') {
			setOverviewAnnouncementsPage(1);
			setOverviewBatchesPage(1);
			setOverviewOrdersPage(1);
		}
		if (!user?.uid) {
			return;
		}
		if (tab === 'analytics') {
			loadSupplyAnalytics(user.uid);
		} else if (tab === 'supply') {
			loadSupplyBatches(user.uid);
		} else if (tab === 'announcements') {
			loadFutureAnnouncements(user.uid);
		} else if (tab === 'orders') {
			loadSupplyOrders(user.uid);
		} else if (tab === 'qr') {
			loadCustomQrCodes(user.uid);
		} else if (tab === 'overview') {
			loadSupplyOrders(user.uid);
			loadFutureAnnouncements(user.uid);
			loadSupplyBatches(user.uid);
		} else if (tab === 'live-offerings') {
			loadLiveOfferings(user.uid);
		}
	};

	const handleSupplyOwnerToggle = (checked) => {
		setIsSupplyOwnerLogin(checked);
		setMode('login');
		setStep('phone');
		setOtp('');
		setPhoneNumber('');
		setName('');
		setEmail('');
		setAddress('');
		setBatchForm({ title: '', quantity: '', expirationDate: '', expirationTime: '', notes: '' });
		setAnnouncementForm({ title: '', description: '', scheduledDate: '', scheduledTime: '', notes: '' });
		setCustomQrForm({ title: '', purpose: '', expiresDate: '', expiresTime: '' });
		setToast(null);
		setConfirmationModal(null);
	};

	const profileCard = (
		<section className="dashboard-card profile-card">
			<div className="card-header">
				<div>
					<h2>Account</h2>
					<p className="muted">Manage your contact information.</p>
				</div>
			</div>
			{profileLoading ? (
				<div className="card-loading">Loading profile...</div>
			) : profileError ? (
				<div className="card-error">{profileError}</div>
			) : userProfile ? (
				<div className="profile-details">
					{!isEditing ? (
						<>
							<div className="profile-item">
								<div className="profile-label">Name</div>
								<div className="profile-value">{userProfile.name || 'Not provided'}</div>
							</div>
							<div className="profile-item">
								<div className="profile-label">Email</div>
								<div className="profile-value">{userProfile.email || 'Not provided'}</div>
							</div>
							<div className="profile-item">
								<div className="profile-label">Phone Number</div>
								<div className="profile-value">{userProfile.phoneNumber || 'Not provided'}</div>
								<div className="profile-note">Phone number cannot be changed</div>
							</div>
							<div className="profile-item">
								<div className="profile-label">Address</div>
								<div className="profile-value">{userProfile.address || 'Not provided'}</div>
							</div>
							<div className="profile-actions">
								<button className="btn" onClick={handleEdit}>Edit Profile</button>
							</div>
						</>
					) : (
						<form onSubmit={handleSave} className="profile-edit-form">
							<div className="profile-item">
								<label className="profile-label" htmlFor="edit-name">Name</label>
								<input
									id="edit-name"
									type="text"
									className="input"
									value={editForm.name}
									onChange={(e) => handleInputChange('name', e.target.value)}
									required
								/>
							</div>
							<div className="profile-item">
								<label className="profile-label" htmlFor="edit-email">Email</label>
								<input
									id="edit-email"
									type="email"
									className="input"
									value={editForm.email}
									onChange={(e) => handleInputChange('email', e.target.value)}
									required
								/>
							</div>
							<div className="profile-item">
								<label className="profile-label">Phone Number</label>
								<div className="profile-value">{userProfile.phoneNumber || 'Not provided'}</div>
								<div className="profile-note">Phone number cannot be changed</div>
							</div>
							<div className="profile-item">
								<label className="profile-label" htmlFor="edit-address">Address</label>
								<input
									id="edit-address"
									type="text"
									className="input"
									value={editForm.address}
									onChange={(e) => handleInputChange('address', e.target.value)}
									required
								/>
							</div>
							{saveError && <div className="profile-error">{saveError}</div>}
							{saveSuccess && <div className="profile-success">Profile updated successfully!</div>}
							<div className="profile-actions">
								<button type="button" className="btn btn-secondary" onClick={handleCancel} disabled={saving}>
									Cancel
								</button>
								<button type="submit" className="btn" disabled={saving}>
									{saving ? 'Saving...' : 'Save Changes'}
								</button>
							</div>
						</form>
					)}
				</div>
			) : (
				<div className="card-empty">Profile information unavailable.</div>
			)}
		</section>
	);

	// Don't render dashboard if user is not authenticated (redirect will happen)
	if (!user) {
		return null;
	}

	// Wait for userProfile to load before making routing decisions
	// If profile is still loading or hasn't loaded yet, show loading state
	if (!userProfile) {
		if (profileError) {
			// Profile failed to load, show error
			return (
				<div className="app-shell">
					<div className="card">
						<p>Error loading profile: {profileError}</p>
						<button className="btn" onClick={() => window.location.reload()}>Reload</button>
					</div>
				</div>
			);
		}
		// Profile is still loading
		return (
			<div className="app-shell">
				<div className="card">
					<p>Loading profile...</p>
				</div>
			</div>
		);
	}

	// Don't render if user profile doesn't match route (only check if profile is loaded)
	if (userProfile) {
		// If user is a supply owner but on student route, redirect
		if (isSupplyOwner && isStudentRoute) {
			return null; // Redirect will happen via useEffect
		}
		// If user is a student but on supply owner route, redirect
		if (!isSupplyOwner && isSupplyOwnerRoute) {
			return null; // Redirect will happen via useEffect
		}
	}

	// Only render supply owner dashboard if we have a profile and user is confirmed as supply owner
	// This was the original logic - just check isSupplyOwner, route matching is handled by React Router
	if (userProfile && isSupplyOwner) {
		const metrics = supplyAnalytics || {};
		const metricValue = (value) => (analyticsLoading ? '…' : (value ?? '—'));
		const totalFeesDisplay = analyticsLoading ? '…' : formatCurrency(metrics.totalFeesCents ?? 0);
		
		// Calculate pagination for overview cards
		const totalAnnouncementsPages = Math.ceil(futureOfferings.length / overviewItemsPerPage);
		const totalBatchesPages = Math.ceil(supplyBatches.length / overviewItemsPerPage);
		const totalOrdersPages = Math.ceil(supplyOrders.length / overviewItemsPerPage);
		
		const announcementsStartIndex = (overviewAnnouncementsPage - 1) * overviewItemsPerPage;
		const announcementsEndIndex = announcementsStartIndex + overviewItemsPerPage;
		const upcomingAnnouncements = futureOfferings.slice(announcementsStartIndex, announcementsEndIndex);
		
		const batchesStartIndex = (overviewBatchesPage - 1) * overviewItemsPerPage;
		const batchesEndIndex = batchesStartIndex + overviewItemsPerPage;
		const recentBatches = supplyBatches.slice(batchesStartIndex, batchesEndIndex);
		
		const ordersStartIndex = (overviewOrdersPage - 1) * overviewItemsPerPage;
		const ordersEndIndex = ordersStartIndex + overviewItemsPerPage;
		const recentOrders = supplyOrders.slice(ordersStartIndex, ordersEndIndex);

		const renderOrders = (ordersList) => {
			// Filter orders based on search query and status filter
			let filteredOrders = ordersList;
			
			// Apply search filter
			if (ordersSearchQuery.trim()) {
				const query = ordersSearchQuery.toLowerCase();
				filteredOrders = filteredOrders.filter((order) => {
					const offeringTitle = (order.offeringTitle || '').toLowerCase();
					const userName = (order.userName || '').toLowerCase();
					return offeringTitle.includes(query) || userName.includes(query);
				});
			}
			
			// Apply status filter
			if (ordersStatusFilter !== 'all') {
				filteredOrders = filteredOrders.filter((order) => {
					const status = (order.status || '').toLowerCase();
					if (ordersStatusFilter === 'pending') {
						return ['pending', 'in-progress', 'processing'].includes(status);
					} else if (ordersStatusFilter === 'collected') {
						return ['collected', 'completed'].includes(status);
					} else if (ordersStatusFilter === 'cancelled') {
						return status === 'cancelled';
					}
					return true;
				});
			}
			
			// Calculate pagination
			const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);
			const startIndex = (ordersCurrentPage - 1) * ordersPerPage;
			const endIndex = startIndex + ordersPerPage;
			const paginatedOrders = filteredOrders.slice(startIndex, endIndex);
			
			// Reset to page 1 if current page is out of bounds
			if (ordersCurrentPage > totalPages && totalPages > 0) {
				setOrdersCurrentPage(1);
			}
			
			if (filteredOrders.length === 0) {
				return (
					<div className="card-empty">
						{ordersSearchQuery || ordersStatusFilter !== 'all' 
							? 'No orders match your filters.' 
							: 'No orders have been placed yet.'}
					</div>
				);
			}
			
			return (
				<>
					<ul className="supply-list">
						{paginatedOrders.map((order) => {
						const status = (order.status || '').toLowerCase();
						const isCollected = order.collectedAt || ['collected', 'completed'].includes(status);
						const isCancelled = status === 'cancelled';
						const canValidate = order.qrToken && !isCollected && !isCancelled;
						return (
							<li key={order.id} className="supply-list-item">
								<div>
									<h4>{order.offeringTitle || 'Prasadam order'}</h4>
									<p className="muted">
										{order.userName && <span>Ordered by {order.userName} • </span>}
										Placed {formatDateTime(order.createdAt)}
									</p>
								</div>
								<div className="supply-list-meta">
									<div>
										<span className="meta-label">Status</span>
										<span className={`meta-value status-badge ${getStatusColorClass(order.status)}`}>
											{formatStatus(order.status)}
										</span>
									</div>
									<div>
										<span className="meta-label">Reservation Fee</span>
										<span className="meta-value">{formatCurrency(order.feeCents)}</span>
									</div>
									<div>
										<span className="meta-label">Collected</span>
										<span className="meta-value">
											{order.collectedAt ? formatDateTime(order.collectedAt) : 'Not yet'}
										</span>
									</div>
								</div>
								{canValidate && (
									<div className="supply-list-actions">
										<button
											className="btn btn-small"
											onClick={() => handleValidateOrder(order)}
											disabled={validatingOrderId === order.id}
										>
											{validatingOrderId === order.id ? 'Validating...' : 'Validate Order'}
										</button>
									</div>
								)}
							</li>
						);
					})}
					</ul>
					{totalPages > 1 && (
						<div className="pagination-controls">
							<button
								className="btn btn-secondary btn-small"
								onClick={() => setOrdersCurrentPage((prev) => Math.max(1, prev - 1))}
								disabled={ordersCurrentPage === 1}
							>
								Previous
							</button>
							<span className="pagination-info">
								Page {ordersCurrentPage} of {totalPages} ({filteredOrders.length} total)
							</span>
							<button
								className="btn btn-secondary btn-small"
								onClick={() => setOrdersCurrentPage((prev) => Math.min(totalPages, prev + 1))}
								disabled={ordersCurrentPage === totalPages}
							>
								Next
							</button>
						</div>
					)}
				</>
			);
		};

		return (
			<>
				<div className="topbar supply-topbar">
					<div className="brand" />
					<div className="brand-name">Prasadam Connect — Supply Portal</div>
					<div className="nav-menu supply-nav">
						<button
							className={`nav-menu-item ${activeSupplyTab === 'overview' ? 'active' : ''}`}
							onClick={() => handleSupplyTabChange('overview')}
						>
							Overview
						</button>
						<button
							className={`nav-menu-item ${activeSupplyTab === 'supply' ? 'active' : ''}`}
							onClick={() => handleSupplyTabChange('supply')}
						>
							Manage Supply
						</button>
						<button
							className={`nav-menu-item ${activeSupplyTab === 'announcements' ? 'active' : ''}`}
							onClick={() => handleSupplyTabChange('announcements')}
						>
							Announcements
						</button>
						<button
							className={`nav-menu-item ${activeSupplyTab === 'live-offerings' ? 'active' : ''}`}
							onClick={() => handleSupplyTabChange('live-offerings')}
						>
							Live Offerings
						</button>
						<button
							className={`nav-menu-item ${activeSupplyTab === 'orders' ? 'active' : ''}`}
							onClick={() => handleSupplyTabChange('orders')}
						>
							Orders
						</button>
						<button
							className={`nav-menu-item ${activeSupplyTab === 'analytics' ? 'active' : ''}`}
							onClick={() => handleSupplyTabChange('analytics')}
						>
							Analytics
						</button>
						<button
							className={`nav-menu-item ${activeSupplyTab === 'qr' ? 'active' : ''}`}
							onClick={() => handleSupplyTabChange('qr')}
						>
							QR Tools
						</button>
						<button
							className={`nav-menu-item ${activeSupplyTab === 'profile' ? 'active' : ''}`}
							onClick={() => handleSupplyTabChange('profile')}
						>
							Profile
						</button>
						<button className="nav-menu-item" onClick={handleSignOut}>
							Sign Out
						</button>
					</div>
				</div>

				{toast && (
					<div className="toast-container">
						<div className={`toast toast-${toast.type === 'error' ? 'error' : 'success'}`}>
							<div className="toast-message">{toast.message}</div>
						</div>
					</div>
				)}

				<div className="supply-dashboard">
					<header className="supply-header">
						<h1>Welcome, {userProfile?.name || 'Supply Partner'}!</h1>
						<p>Coordinate prasadam batches, announcements, analytics, and QR validation from one place.</p>
					</header>

					{activeSupplyTab === 'overview' && (
						<section className="supply-section">
							<div className="supply-metrics-grid">
								<div className="supply-metric-card">
									<span className="metric-label">Total Orders</span>
									<strong>{metricValue(metrics.totalOrders)}</strong>
									<p className="muted">All-time reservations</p>
								</div>
								<div className="supply-metric-card">
									<span className="metric-label">Pending Orders</span>
									<strong>{metricValue(metrics.pendingOrders)}</strong>
									<p className="muted">Awaiting pickup</p>
								</div>
								<div className="supply-metric-card">
									<span className="metric-label">Collected Orders</span>
									<strong>{metricValue(metrics.collectedOrders)}</strong>
									<p className="muted">Marked as served</p>
								</div>
								<div className="supply-metric-card">
									<span className="metric-label">Unique Students</span>
									<strong>{metricValue(metrics.uniqueStudents)}</strong>
									<p className="muted">Served this term</p>
								</div>
								<div className="supply-metric-card">
									<span className="metric-label">Active Offerings</span>
									<strong>{metricValue(metrics.activeOfferings)}</strong>
									<p className="muted">Currently available</p>
								</div>
								<div className="supply-metric-card">
									<span className="metric-label">Reservation Fees</span>
									<strong>{totalFeesDisplay}</strong>
									<p className="muted">Before refunds are issued</p>
								</div>
							</div>

							<div className="supply-panels">
								<div className="supply-card">
									<div className="card-header">
										<h3>Upcoming announcements</h3>
									</div>
									{futureOfferingsLoading ? (
										<div className="card-loading">Loading announcements...</div>
									) : futureOfferingsError ? (
										<div className="card-error">{futureOfferingsError}</div>
									) : futureOfferings.length === 0 ? (
										<div className="card-empty">No announcements scheduled yet.</div>
									) : (
										<>
											<ul className="supply-list">
												{upcomingAnnouncements.map((announcement) => (
													<li key={announcement.id} className="supply-list-item">
														<div>
															<h4>{announcement.title}</h4>
															<p className="muted">{announcement.description || 'No description provided.'}</p>
														</div>
														<div className="supply-list-meta">
															<span className="meta-label">Scheduled</span>
															<span className="meta-value">{formatDateTime(announcement.scheduledAt)}</span>
														</div>
													</li>
												))}
											</ul>
											{totalAnnouncementsPages > 1 && (
												<div className="pagination-controls">
													<button
														className="btn btn-secondary btn-small"
														onClick={() => setOverviewAnnouncementsPage((prev) => Math.max(1, prev - 1))}
														disabled={overviewAnnouncementsPage === 1}
													>
														Previous
													</button>
													<span className="pagination-info">
														Page {overviewAnnouncementsPage} of {totalAnnouncementsPages} ({futureOfferings.length} total)
													</span>
													<button
														className="btn btn-secondary btn-small"
														onClick={() => setOverviewAnnouncementsPage((prev) => Math.min(totalAnnouncementsPages, prev + 1))}
														disabled={overviewAnnouncementsPage === totalAnnouncementsPages}
													>
														Next
													</button>
												</div>
											)}
										</>
									)}
							</div>

							<div className="supply-card">
								<div className="card-header">
									<h3>Latest batches</h3>
								</div>
								{supplyBatchesLoading ? (
									<div className="card-loading">Loading batches...</div>
								) : supplyBatchesError ? (
									<div className="card-error">{supplyBatchesError}</div>
								) : supplyBatches.length === 0 ? (
									<div className="card-empty">Log a batch to track your supply.</div>
								) : (
									<>
										<ul className="supply-list">
											{recentBatches.map((batch) => (
												<li key={batch.id} className="supply-list-item">
													<div>
														<h4>{batch.title}</h4>
														<p className="muted">{batch.notes || 'No notes provided.'}</p>
													</div>
													<div className="supply-list-meta">
														<div>
															<span className="meta-label">Quantity</span>
															<span className="meta-value">{batch.quantity}</span>
														</div>
														<div>
															<span className="meta-label">Remaining</span>
															<span className="meta-value">{batch.remainingQuantity ?? '—'}</span>
														</div>
														<div>
															<span className="meta-label">Expires</span>
															<span className="meta-value">
																{batch.expirationAt ? formatDateTime(batch.expirationAt) : '—'}
															</span>
														</div>
													</div>
												</li>
											))}
										</ul>
										{totalBatchesPages > 1 && (
											<div className="pagination-controls">
												<button
													className="btn btn-secondary btn-small"
													onClick={() => setOverviewBatchesPage((prev) => Math.max(1, prev - 1))}
													disabled={overviewBatchesPage === 1}
												>
													Previous
												</button>
												<span className="pagination-info">
													Page {overviewBatchesPage} of {totalBatchesPages} ({supplyBatches.length} total)
												</span>
												<button
													className="btn btn-secondary btn-small"
													onClick={() => setOverviewBatchesPage((prev) => Math.min(totalBatchesPages, prev + 1))}
													disabled={overviewBatchesPage === totalBatchesPages}
												>
													Next
												</button>
											</div>
										)}
									</>
								)}
							</div>

							<div className="supply-card">
								<div className="card-header">
									<h3>Recent orders</h3>
								</div>
								{supplyOrdersLoading && supplyOrders.length === 0 ? (
									<div className="card-loading">Loading orders...</div>
								) : supplyOrdersError ? (
									<div className="card-error">{supplyOrdersError}</div>
								) : supplyOrders.length === 0 ? (
									<div className="card-empty">No orders yet. Students will appear here once they reserve.</div>
								) : (
									<>
										<ul className="supply-list">
											{recentOrders.map((order) => {
												const status = (order.status || '').toLowerCase();
												const isCollected = order.collectedAt || ['collected', 'completed'].includes(status);
												const isCancelled = status === 'cancelled';
												return (
													<li key={order.id} className="supply-list-item">
														<div>
															<h4>{order.offeringTitle || 'Prasadam order'}</h4>
															<p className="muted">
																{order.userName && <span>Ordered by {order.userName} • </span>}
																Placed {formatDateTime(order.createdAt)}
															</p>
														</div>
														<div className="supply-list-meta">
															<div>
																<span className="meta-label">Status</span>
																<span className={`meta-value status-badge ${getStatusColorClass(order.status)}`}>
																	{formatStatus(order.status)}
																</span>
															</div>
															<div>
																<span className="meta-label">Reservation Fee</span>
																<span className="meta-value">{formatCurrency(order.feeCents)}</span>
															</div>
															<div>
																<span className="meta-label">Collected</span>
																<span className="meta-value">
																	{order.collectedAt ? formatDateTime(order.collectedAt) : 'Not yet'}
																</span>
															</div>
														</div>
													</li>
												);
											})}
										</ul>
										{totalOrdersPages > 1 && (
											<div className="pagination-controls">
												<button
													className="btn btn-secondary btn-small"
													onClick={() => setOverviewOrdersPage((prev) => Math.max(1, prev - 1))}
													disabled={overviewOrdersPage === 1}
												>
													Previous
												</button>
												<span className="pagination-info">
													Page {overviewOrdersPage} of {totalOrdersPages} ({supplyOrders.length} total)
												</span>
												<button
													className="btn btn-secondary btn-small"
													onClick={() => setOverviewOrdersPage((prev) => Math.min(totalOrdersPages, prev + 1))}
													disabled={overviewOrdersPage === totalOrdersPages}
												>
													Next
												</button>
											</div>
										)}
									</>
								)}
							</div>
						</div>
					</section>
					)}

					{activeSupplyTab === 'supply' && (
						<section className="supply-section">
							<div className="supply-columns">
								<form className="supply-form" onSubmit={handleCreateBatch}>
									<h3>Record new batch</h3>
									<p className="muted">Log incoming prasadam to keep availability in sync.</p>
									<label>
										<span className="form-label">Batch title</span>
										<input
											type="text"
											className="input"
											value={batchForm.title}
											onChange={(e) => setBatchForm((prev) => ({ ...prev, title: e.target.value }))}
											placeholder="Saturday Lunch Batch"
										/>
									</label>
									<label>
										<span className="form-label">Quantity</span>
										<input
											type="number"
											min="1"
											className="input"
											value={batchForm.quantity}
											onChange={(e) => setBatchForm((prev) => ({ ...prev, quantity: e.target.value }))}
											required
										/>
									</label>
									<div className="date-time-row">
										<label>
											<span className="form-label">Expiration date (optional)</span>
											<input
												type="date"
												className="input"
												value={batchForm.expirationDate}
												onChange={(e) => setBatchForm((prev) => ({ ...prev, expirationDate: e.target.value }))}
											/>
										</label>
										<label>
											<span className="form-label">Expiration time</span>
											<input
												type="time"
												className="input"
												value={batchForm.expirationTime}
												onChange={(e) => setBatchForm((prev) => ({ ...prev, expirationTime: e.target.value }))}
											/>
										</label>
									</div>
									<label>
										<span className="form-label">Notes</span>
										<textarea
											className="input"
											value={batchForm.notes}
											onChange={(e) => setBatchForm((prev) => ({ ...prev, notes: e.target.value }))}
											placeholder="Storage location, ingredients, helpers..."
										/>
									</label>
									<button type="submit" className="btn" disabled={supplyBatchesLoading}>
										{supplyBatchesLoading ? 'Saving...' : 'Save batch'}
									</button>
									{supplyBatchesError && <div className="card-error">{supplyBatchesError}</div>}
								</form>

								<div className="supply-card">
									<div className="card-header">
										<h3>All batches</h3>
									</div>
									{supplyBatchesLoading && supplyBatches.length === 0 ? (
										<div className="card-loading">Loading batches...</div>
									) : supplyBatches.length === 0 ? (
										<div className="card-empty">No batches recorded yet.</div>
									) : (
										<ul className="supply-list">
											{supplyBatches.map((batch) => (
												<li key={batch.id} className="supply-list-item">
													<div>
														<h4>{batch.title}</h4>
														<p className="muted">{batch.notes || 'No notes provided.'}</p>
													</div>
													<div className="supply-list-meta">
														<div>
															<span className="meta-label">Quantity</span>
															<span className="meta-value">{batch.quantity}</span>
														</div>
														<div>
															<span className="meta-label">Remaining</span>
															<span className="meta-value">{batch.remainingQuantity ?? '—'}</span>
														</div>
														<div>
															<span className="meta-label">Expires</span>
															<span className="meta-value">
																{batch.expirationAt ? formatDateTime(batch.expirationAt) : '—'}
															</span>
														</div>
													</div>
												</li>
											))}
										</ul>
									)}
								</div>
							</div>
						</section>
					)}

					{activeSupplyTab === 'announcements' && (
						<section className="supply-section">
							<div className="supply-columns">
								<form className="supply-form" onSubmit={handleCreateAnnouncement}>
									<h3>Announce future offering</h3>
									<p className="muted">Give students a heads-up about upcoming prasadam.</p>
									<label>
										<span className="form-label">Title</span>
										<input
											type="text"
											className="input"
											value={announcementForm.title}
											onChange={(e) => setAnnouncementForm((prev) => ({ ...prev, title: e.target.value }))}
											placeholder="Festive prasadam"
											required
										/>
									</label>
									<label>
										<span className="form-label">Description</span>
										<textarea
											className="input"
											value={announcementForm.description}
											onChange={(e) => setAnnouncementForm((prev) => ({ ...prev, description: e.target.value }))}
											placeholder="Describe the prasadam, serving window, volunteers..."
										/>
									</label>
									<div className="date-time-row">
										<label>
											<span className="form-label">Availability date</span>
											<input
												type="date"
												className="input"
												value={announcementForm.scheduledDate}
												onChange={(e) => setAnnouncementForm((prev) => ({ ...prev, scheduledDate: e.target.value }))}
												required
											/>
										</label>
										<label>
											<span className="form-label">Availability time</span>
											<input
												type="time"
												className="input"
												value={announcementForm.scheduledTime}
												onChange={(e) => setAnnouncementForm((prev) => ({ ...prev, scheduledTime: e.target.value }))}
												required
											/>
										</label>
									</div>
									<label>
										<span className="form-label">Notes</span>
										<textarea
											className="input"
											value={announcementForm.notes}
											onChange={(e) => setAnnouncementForm((prev) => ({ ...prev, notes: e.target.value }))}
											placeholder="Volunteer reminders, ingredients, set-up instructions"
										/>
									</label>
									<label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
										<input
											type="checkbox"
											checked={announcementForm.showNotesToStudents}
											onChange={(e) => setAnnouncementForm((prev) => ({ ...prev, showNotesToStudents: e.target.checked }))}
											style={{ width: 'auto', cursor: 'pointer' }}
										/>
										<span className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
											Show notes to students on announcements dashboard
										</span>
									</label>
									<button type="submit" className="btn" disabled={futureOfferingsLoading}>
										{futureOfferingsLoading ? 'Scheduling...' : 'Schedule announcement'}
									</button>
									{futureOfferingsError && <div className="card-error">{futureOfferingsError}</div>}
								</form>

							<div className="supply-card">
								<div className="card-header">
									<h3>Scheduled offerings</h3>
								</div>
								{futureOfferingsLoading && futureOfferings.length === 0 ? (
									<div className="card-loading">Loading announcements...</div>
								) : futureOfferings.length === 0 ? (
									<div className="card-empty">No announcements scheduled.</div>
								) : (
									<ul className="supply-list">
										{futureOfferings.map((item) => (
											<li key={item.id} className="supply-list-item">
												<div>
													<h4>{item.title}</h4>
													<p className="muted">{item.description || 'No description provided.'}</p>
												</div>
												<div className="supply-list-meta">
													<div>
														<span className="meta-label">Scheduled</span>
														<span className="meta-value">{formatDateTime(item.scheduledAt)}</span>
													</div>
													{item.notes && (
														<div>
															<span className="meta-label">Notes</span>
															<span className="meta-value">{item.notes}</span>
														</div>
													)}
												</div>
											<div className="supply-list-actions">
												{publishingOfferingId === item.id ? (
													<form
														className="profile-edit-form"
														onSubmit={async (e) => {
															e.preventDefault();
															if (!user?.uid) return;
															const quantityValue = Number.parseInt(publishForm.quantity, 10);
															const feeValue = Number.parseInt(publishForm.feeCents, 10) || 0;
															if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
																setToast({ type: 'error', message: 'Please enter a valid quantity.' });
																return;
															}
															try {
																const response = await publishFutureOffering({
																	uid: user.uid,
																	futureOfferingId: item.id,
																	quantity: quantityValue,
																	feeCents: feeValue,
																	launchFeeRefund: true,
																});
																if (response?.success) {
																	setToast({ type: 'success', message: 'Offering published live.' });
																	setPublishingOfferingId(null);
																	setPublishForm({ quantity: '', feeCents: '' });
																	// Delete the future offering from database
																	try {
																		await deleteFutureOffering(item.id, user.uid);
																	} catch (deleteErr) {
																		console.error('Error deleting future offering:', deleteErr);
																		// Continue even if delete fails - we'll remove from UI anyway
																	}
																	// Remove the published announcement from scheduled offerings
																	setFutureOfferings((prev) => prev.filter((announcement) => announcement.id !== item.id));
																	await loadLiveOfferings(user.uid);
																} else {
																	setToast({ type: 'error', message: response?.error || 'Failed to publish offering' });
																}
															} catch (err) {
																console.error('Error publishing offering:', err);
																setToast({ type: 'error', message: err?.message || 'Failed to publish offering' });
															}
														}}
													>
														<div className="profile-item">
															<label className="profile-label">Quantity</label>
															<input
																type="number"
																min="1"
																className="input"
																value={publishForm.quantity}
																onChange={(e) => setPublishForm((prev) => ({ ...prev, quantity: e.target.value }))}
																required
															/>
														</div>
														<div className="profile-item">
															<label className="profile-label">Reservation fee (cents)</label>
															<input
																type="number"
																min="0"
																className="input"
																value={publishForm.feeCents}
																onChange={(e) => setPublishForm((prev) => ({ ...prev, feeCents: e.target.value }))}
																required
															/>
														</div>
														<div className="profile-actions">
															<button
																type="button"
																className="btn btn-secondary"
																onClick={() => {
																	setPublishingOfferingId(null);
																	setPublishForm({ quantity: '', feeCents: '' });
																}}
															>
																Cancel
															</button>
															<button type="submit" className="btn">
																Publish
															</button>
														</div>
													</form>
												) : (
													<button
														className="btn btn-small"
														onClick={() => {
															setPublishingOfferingId(item.id);
															setPublishForm({ quantity: '50', feeCents: '100' });
														}}
													>
														Publish as live offering
													</button>
												)}
											</div>
											</li>
										))}
									</ul>
								)}
							</div>
						</div>
						</section>
					)}

					{activeSupplyTab === 'live-offerings' && (
						<section className="supply-section">
							<div className="supply-card">
								<div className="card-header">
									<h3>Live offerings</h3>
								</div>
								{liveOfferingsLoading && liveOfferings.length === 0 ? (
									<div className="card-loading">Loading live offerings...</div>
								) : liveOfferingsError ? (
									<div className="card-error">{liveOfferingsError}</div>
								) : liveOfferings.length === 0 ? (
									<div className="card-empty">No live offerings yet. Publish from scheduled offerings to make them visible to students.</div>
								) : (
									<ul className="supply-list">
										{liveOfferings.map((offering) => (
											<li key={offering.id} className="supply-list-item">
												<div>
													<h4>{offering.title}</h4>
													<p className="muted">{offering.description || 'No description provided.'}</p>
												</div>
												<div className="supply-list-meta">
													<div>
														<span className="meta-label">Available at</span>
														<span className="meta-value">{formatDateTime(offering.availableAt)}</span>
													</div>
													<div>
														<span className="meta-label">Quantity</span>
														<span className="meta-value">{offering.availableQuantity ?? '—'}</span>
													</div>
													<div>
														<span className="meta-label">Reservation fee</span>
														<span className="meta-value">{formatCurrency(offering.feeCents)}</span>
													</div>
													<div>
														<span className="meta-label">Status</span>
														<span className="meta-value">{formatStatus(offering.status)}</span>
													</div>
												</div>
											<div className="supply-list-actions">
												{editingOfferingId === offering.id ? (
													<form
														className="profile-edit-form"
														onSubmit={async (e) => {
															e.preventDefault();
															if (!user?.uid) return;
															const quantityValue = Number.parseInt(editingOfferingForm.quantity, 10);
															if (!Number.isFinite(quantityValue) || quantityValue < 0) {
																setToast({ type: 'error', message: 'Please enter a valid quantity (0 or more).' });
																return;
															}
															const statusValue = (editingOfferingForm.status || '').trim() || 'available';
															
															// Prepare update payload
															const updatePayload = {
																uid: user.uid,
																availableQuantity: quantityValue,
																status: statusValue,
															};
															
															// Add availableAt if date/time is provided
															const availableAtIso = isoFromDateTime(editingOfferingForm.availableDate, editingOfferingForm.availableTime);
															if (availableAtIso) {
																updatePayload.availableAt = availableAtIso;
															}
															
															try {
																const response = await updateSupplyOffering(offering.id, updatePayload);
																if (response?.success) {
																	setToast({ type: 'success', message: 'Offering updated.' });
																	setEditingOfferingId(null);
																	setEditingOfferingForm({ quantity: '', status: '', availableDate: '', availableTime: '' });
																	await loadLiveOfferings(user.uid);
																} else {
																	setToast({ type: 'error', message: response?.error || 'Failed to update offering' });
																}
															} catch (err) {
																console.error('Error updating offering:', err);
																setToast({ type: 'error', message: err?.message || 'Failed to update offering' });
															}
														}}
													>
														<div className="profile-item">
															<label className="profile-label">Quantity</label>
															<input
																type="number"
																min="0"
																className="input"
																value={editingOfferingForm.quantity}
																onChange={(e) => setEditingOfferingForm((prev) => ({ ...prev, quantity: e.target.value }))}
																required
															/>
														</div>
														<div className="profile-item">
															<label className="profile-label">Status</label>
															<select
																className="input"
																value={editingOfferingForm.status}
																onChange={(e) => setEditingOfferingForm((prev) => ({ ...prev, status: e.target.value }))}
															>
																<option value="available">Available</option>
																<option value="sold-out">Sold out</option>
																<option value="closed">Closed</option>
															</select>
														</div>
														<div className="date-time-row">
															<div className="profile-item">
																<label className="profile-label">Available date</label>
																<input
																	type="date"
																	className="input"
																	value={editingOfferingForm.availableDate}
																	onChange={(e) => setEditingOfferingForm((prev) => ({ ...prev, availableDate: e.target.value }))}
																/>
															</div>
															<div className="profile-item">
																<label className="profile-label">Available time</label>
																<input
																	type="time"
																	className="input"
																	value={editingOfferingForm.availableTime}
																	onChange={(e) => setEditingOfferingForm((prev) => ({ ...prev, availableTime: e.target.value }))}
																/>
															</div>
														</div>
														<div className="profile-actions">
															<button
																type="button"
																className="btn btn-secondary"
																onClick={() => {
																	setEditingOfferingId(null);
																	setEditingOfferingForm({ quantity: '', status: '', availableDate: '', availableTime: '' });
																}}
															>
																Cancel
															</button>
															<button type="submit" className="btn btn-small">
																Save
															</button>
														</div>
													</form>
												) : (
													<div className="supply-list-actions-group">
														<button
															className="btn btn-secondary btn-small"
															onClick={() => {
																setEditingOfferingId(offering.id);
																// Format the availableAt date for the form inputs
																const availableAt = offering.availableAt;
																let dateValue = '';
																let timeValue = '';
																if (availableAt) {
																	const date = availableAt instanceof Date ? availableAt : new Date(availableAt);
																	if (!Number.isNaN(date.getTime())) {
																		dateValue = date.toISOString().split('T')[0];
																		timeValue = date.toTimeString().slice(0, 5);
																	}
																}
																setEditingOfferingForm({
																	quantity: String(offering.availableQuantity ?? ''),
																	status: offering.status || 'available',
																	availableDate: dateValue,
																	availableTime: timeValue,
																});
															}}
														>
															Edit
														</button>
													</div>
												)}
											</div>
											</li>
										))}
									</ul>
								)}
							</div>
						</section>
					)}

					{activeSupplyTab === 'orders' && (
						<section className="supply-section">
							<div className="supply-card">
								<div className="card-header">
									<h3>All orders</h3>
								</div>
								
								{/* Search and Filter Controls */}
								<div className="orders-filters">
									<div className="search-input-wrapper">
										<input
											type="text"
											className="input"
											placeholder="Search by offering or student name..."
											value={ordersSearchQuery}
											onChange={(e) => {
												setOrdersSearchQuery(e.target.value);
												setOrdersCurrentPage(1); // Reset to first page when search changes
											}}
										/>
									</div>
									<select
										className="input"
										value={ordersStatusFilter}
										onChange={(e) => {
											setOrdersStatusFilter(e.target.value);
											setOrdersCurrentPage(1); // Reset to first page when filter changes
										}}
										style={{ minWidth: '150px' }}
									>
										<option value="all">All Status</option>
										<option value="pending">Pending</option>
										<option value="collected">Collected</option>
										<option value="cancelled">Cancelled</option>
									</select>
								</div>
								
								{supplyOrdersLoading && supplyOrders.length === 0 ? (
									<div className="card-loading">Loading orders...</div>
								) : supplyOrdersError ? (
									<div className="card-error">{supplyOrdersError}</div>
								) : supplyOrders.length === 0 ? (
									<div className="card-empty">No orders have been placed yet.</div>
								) : (
									renderOrders(ordersWithUserNames.length > 0 ? ordersWithUserNames : supplyOrders)
								)}
							</div>
						</section>
					)}

					{activeSupplyTab === 'analytics' && (
						<section className="supply-section">
							<div className="supply-card">
								<div className="card-header">
									<h3>Distribution insights</h3>
								</div>
								{analyticsLoading && !supplyAnalytics ? (
									<div className="card-loading">Crunching the numbers...</div>
								) : analyticsError ? (
									<div className="card-error">{analyticsError}</div>
								) : (
									<div className="analytics-grid">
										<div className="analytics-item">
											<span className="meta-label">Refunded Orders</span>
											<span className="meta-value">{metricValue(metrics.refundedOrders)}</span>
											<p className="muted">Orders eligible for launch refunds</p>
										</div>
										<div className="analytics-item">
											<span className="meta-label">Upcoming Offerings</span>
											<span className="meta-value">{metricValue(metrics.upcomingOfferings)}</span>
											<p className="muted">Scheduled but not yet live</p>
										</div>
										<div className="analytics-item">
											<span className="meta-label">Total Reservation Fees</span>
											<span className="meta-value">{totalFeesDisplay}</span>
											<p className="muted">Before refunds are issued</p>
										</div>
										<div className="analytics-item">
											<span className="meta-label">Student Reach</span>
											<span className="meta-value">{metricValue(metrics.uniqueStudents)}</span>
											<p className="muted">Unique students served</p>
										</div>
									</div>
								)}
								<div className="note">
									Use these insights to plan batch sizes, volunteer shifts, and outreach.
								</div>
							</div>
						</section>
					)}

					{activeSupplyTab === 'qr' && (
						<section className="supply-section">
							<div className="supply-columns qr-columns">
								<div className="supply-card">
									<div className="card-header">
										<h3>Validate student pickup</h3>
									</div>
									<form className="supply-form" onSubmit={handleValidateQrToken}>
										<label>
											<span className="form-label">Scan or enter QR token</span>
											<div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
												<input
													type="text"
													className="input"
													value={qrTokenInput}
													onChange={(e) => setQrTokenInput(e.target.value)}
													placeholder="Paste token from QR scanner"
													style={{ paddingRight: '45px', flex: 1 }}
												/>
												<button
													type="button"
													onClick={qrScannerActive ? handleStopQrScanner : handleStartQrScanner}
													style={{
														position: 'absolute',
														right: '8px',
														background: 'transparent',
														border: 'none',
														cursor: 'pointer',
														padding: '4px',
														display: 'flex',
														alignItems: 'center',
														justifyContent: 'center',
														color: qrScannerActive ? 'var(--danger, #ef4444)' : 'var(--primary, #22d3ee)',
													}}
													title={qrScannerActive ? 'Stop camera' : 'Scan QR code with camera'}
												>
													<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
														{qrScannerActive ? (
															<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
														) : (
															<>
																<path d="M12 8V12M12 12V16M12 12H16M12 12H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
																<path d="M3 7C3 5.89543 3.89543 5 5 5H7M17 5H19C20.1046 5 21 5.89543 21 7V9M21 15V17C21 18.1046 20.1046 19 19 19H17M7 19H5C3.89543 19 3 18.1046 3 17V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
															</>
														)}
													</svg>
												</button>
											</div>
										</label>
										{qrScanningError && <div className="card-error">{qrScanningError}</div>}
										<button type="submit" className="btn" disabled={qrProcessing || qrScannerActive}>
											{qrProcessing ? 'Validating...' : 'Validate code'}
										</button>
										{qrValidationError && <div className="card-error">{qrValidationError}</div>}
									</form>
									{qrScannerActive && (
										<div className="qr-scanner-overlay">
											<div className="qr-scanner-container">
												<div className="qr-scanner-header">
													<h4>Scan QR Code</h4>
													<button
														type="button"
														onClick={handleStopQrScanner}
														style={{
															background: 'transparent',
															border: 'none',
															cursor: 'pointer',
															color: 'var(--text)',
															padding: '4px',
														}}
													>
														<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
															<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
														</svg>
													</button>
												</div>
												<div id="qr-reader" style={{ width: '100%' }}></div>
											</div>
										</div>
									)}
									{qrValidationResult && (
										<div className="validated-order">
											<h4>Order confirmed</h4>
											<p className="muted">Reservation fee: {formatCurrency(qrValidationResult.feeCents)}</p>
											<p className="muted">Status updated to collected.</p>
										</div>
									)}
								</div>

								<div className="supply-card">
									<div className="card-header">
										<h3>Generate event QR</h3>
									</div>
									<form className="supply-form" onSubmit={handleGenerateCustomQr}>
										<label>
											<span className="form-label">Title</span>
											<input
												className="input"
												value={customQrForm.title}
												onChange={(e) => setCustomQrForm((prev) => ({ ...prev, title: e.target.value }))}
												placeholder="Club gathering"
											/>
										</label>
										<label>
											<span className="form-label">Purpose</span>
											<textarea
												className="input"
												value={customQrForm.purpose}
												onChange={(e) => setCustomQrForm((prev) => ({ ...prev, purpose: e.target.value }))}
												placeholder="Door access, free prasadam coupons, etc."
											/>
										</label>
										<div className="date-time-row">
											<label>
												<span className="form-label">Expiration date</span>
												<input
													type="date"
													className="input"
													value={customQrForm.expiresDate}
													onChange={(e) => setCustomQrForm((prev) => ({ ...prev, expiresDate: e.target.value }))}
												/>
											</label>
											<label>
												<span className="form-label">Expiration time</span>
												<input
													type="time"
													className="input"
													value={customQrForm.expiresTime}
													onChange={(e) => setCustomQrForm((prev) => ({ ...prev, expiresTime: e.target.value }))}
												/>
											</label>
										</div>
										<button type="submit" className="btn" disabled={customQrLoading}>
											{customQrLoading ? 'Creating...' : 'Generate QR'}
										</button>
										{customQrError && <div className="card-error">{customQrError}</div>}
									</form>
									{customQrResult && (
										<div className="custom-qr-preview">
											<QRCode value={customQrResult.qrToken} size={140} />
											<p className="muted">Token: {customQrResult.qrToken}</p>
										</div>
									)}
								</div>
							</div>

							<div className="supply-card">
								<div className="card-header">
									<h3>Issued QR codes</h3>
								</div>
								{qrCodesLoading && qrCodes.length === 0 ? (
									<div className="card-loading">Loading issued codes...</div>
								) : qrCodesError ? (
									<div className="card-error">{qrCodesError}</div>
								) : qrCodes.length === 0 ? (
									<div className="card-empty">No custom QR codes issued yet.</div>
								) : (
									<ul className="qr-code-list">
										{qrCodes.map((code) => (
											<li key={code.qrToken} className="qr-code-item">
												<QRCode value={code.qrToken} size={80} />
												<div>
													<h4>{code.title}</h4>
													<p className="muted">{code.purpose || 'No purpose noted.'}</p>
													<div className="meta">
														<span className="meta-label">Expires</span>
														<span className="meta-value">
															{code.expiresAt ? formatDateTime(code.expiresAt) : 'No expiry'}
														</span>
													</div>
												</div>
											</li>
										))}
									</ul>
								)}
							</div>
						</section>
					)}

					{activeSupplyTab === 'profile' && (
						<div className="profile-page">
							<header className="profile-page-header">
								<h1>Profile</h1>
								<p className="muted">Manage your account information</p>
							</header>
							<div className="profile-page-content">
								{profileCard}
							</div>
						</div>
					)}
				</div>
			</>
		);
	}

	// Render student dashboard (this is the fallback after supply owner check above)
	// The route checks at lines 1101-1111 already handle redirects for wrong routes
	const subscription = userProfile?.subscription || {};
	const subscriptionActive = Boolean(subscription.active);
	const subscriptionWaived = subscription.waived !== false; // default true
	const subscriptionRenewal = subscription.renewsAt
		? new Date(subscription.renewsAt)
		: null;

	return (
		<>
			<div className="topbar">
				<div className="brand" />
				<div className="brand-name">Prasadam Connect</div>
				<div className="nav-menu">
					<button
						className={`nav-menu-item ${currentPage === 'home' ? 'active' : ''}`}
						onClick={() => setCurrentPage('home')}
					>
						Home
					</button>
					<button
						className={`nav-menu-item ${currentPage === 'orders' ? 'active' : ''}`}
						onClick={() => setCurrentPage('orders')}
					>
						Orders
					</button>
					<button
						className={`nav-menu-item ${currentPage === 'profile' ? 'active' : ''}`}
						onClick={handleProfileClick}
					>
						Profile
					</button>
					<button className="nav-menu-item" onClick={handleSignOut}>
						Sign Out
					</button>
			</div>
				</div>

			{toast && (
				<div className="toast-container">
					<div className={`toast toast-${toast.type === 'error' ? 'error' : 'success'}`}>
						<div className="toast-message">{toast.message}</div>
					</div>
				</div>
			)}

			{currentPage === 'home' ? (
				<div className="dashboard">
					<header className="dashboard-header">
						<h1>Welcome back, {userProfile?.name || 'Student'}!</h1>
						<p>Stay in sync with real-time prasadam drops, orders, and your subscription.</p>
					</header>

					<div className="dashboard-grid">
						{/* Available Prasadam Section with Carousel */}
						<section className="dashboard-card offerings-card">
							<div className="card-header">
								<div>
									<h2>Available Prasadam</h2>
									<p className="muted">Tap order to reserve your portion instantly.</p>
								</div>
								<span className="pill live-pill">Live</span>
							</div>

							{offeringsLoading ? (
								<div className="card-loading">Checking the kitchen...</div>
							) : offeringsError ? (
								<div className="card-error">{offeringsError}</div>
							) : (() => {
								// Filter available offerings
								const availableOfferings = offerings.filter((offering) => {
									const availableQuantity =
										typeof offering.availableQuantity === 'number'
											? offering.availableQuantity
											: null;
									const isAvailable =
										['available', 'open'].includes((offering.status || '').toLowerCase()) &&
										(availableQuantity === null || availableQuantity > 0);
									return isAvailable;
								});

								if (availableOfferings.length === 0) {
									return (
										<div className="card-empty">
											No offerings right now. You&apos;ll get a ping the moment prasadam is ready!
										</div>
									);
								}

								// Ensure currentOfferingIndex is within bounds
								const safeIndex = Math.min(currentOfferingIndex, Math.max(0, availableOfferings.length - 1));
								const currentOffering = availableOfferings[safeIndex];
								const availableQuantity =
									typeof currentOffering.availableQuantity === 'number'
										? currentOffering.availableQuantity
										: null;

								return (
									<div className="offerings-carousel">
										<div className="carousel-container">
											<div className="carousel-slide active">
												<div className="offering-item">
													<div className="offering-header">
														<h3>{currentOffering.title}</h3>
														<span className="status-pill status-available">
															Available
														</span>
													</div>
													<p className="muted">{currentOffering.description || 'Fresh prasadam from the kitchen.'}</p>
													<div className="offering-meta">
														<div>
															<span className="meta-label">Available</span>
															<span className="meta-value">{formatDateTime(currentOffering.availableAt)}</span>
														</div>
														<div>
															<span className="meta-label">Reservation Fee</span>
															<span className="meta-value">{formatCurrency(currentOffering.feeCents)}</span>
														</div>
														<div>
															<span className="meta-label">Quantity</span>
															<span className="meta-value">
																{availableQuantity === null ? '—' : availableQuantity <= 0 ? 'None' : availableQuantity}
															</span>
														</div>
													</div>
													{currentOffering.launchFeeRefund && (
														<div className="note">Launch bonus: your reservation fee is refunded at pick-up.</div>
													)}
													<button
														className="btn offering-btn"
														disabled={orderingOfferingId === currentOffering.id}
														onClick={() => handleOrder(currentOffering)}
													>
														{orderingOfferingId === currentOffering.id ? 'Reserving...' : 'Reserve now'}
													</button>
												</div>
											</div>
										</div>

										{availableOfferings.length > 1 && (
											<div className="carousel-controls">
												<button
													className="carousel-btn carousel-btn-prev"
													onClick={() => setCurrentOfferingIndex((prev) => (prev > 0 ? prev - 1 : availableOfferings.length - 1))}
													aria-label="Previous offering"
												>
													<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
														<path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
													</svg>
												</button>
												<div className="carousel-indicators">
													{availableOfferings.map((_, index) => (
														<button
															key={index}
															className={`carousel-indicator ${index === safeIndex ? 'active' : ''}`}
															onClick={() => setCurrentOfferingIndex(index)}
															aria-label={`Go to offering ${index + 1}`}
														/>
													))}
												</div>
												<button
													className="carousel-btn carousel-btn-next"
													onClick={() => setCurrentOfferingIndex((prev) => (prev < availableOfferings.length - 1 ? prev + 1 : 0))}
													aria-label="Next offering"
												>
													<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
														<path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
													</svg>
												</button>
											</div>
										)}

										<div className="carousel-counter">
											{safeIndex + 1} of {availableOfferings.length}
										</div>
									</div>
								);
							})()}
							{orderError && <div className="card-error">{orderError}</div>}
						</section>

						{/* Your Orders Section - Side by side with Available Prasadam */}
						{orders.length > 0 && (
							<section className="dashboard-card orders-card">
							<div className="card-header">
								<div>
									<h2>Your Orders</h2>
									<p className="muted">Track your current reservations.</p>
								</div>
							</div>
							{ordersLoading ? (
								<div className="card-loading">Loading your orders...</div>
							) : ordersError ? (
								<div className="card-error">{ordersError}</div>
							) : (() => {
								// Only show pending orders in "Your Orders" section
								const pendingOrders = orders.filter((order) => {
									const status = (order.status || '').toLowerCase();
									return ['pending', 'in-progress', 'processing'].includes(status);
								});
								
								if (pendingOrders.length === 0) {
									return (
										<div className="card-empty">You don&apos;t have any pending orders.</div>
									);
								}
								
								// Continue with carousel rendering for pending orders
								return (
									<div className="orders-carousel">
										{(() => {
											const activeOrders = pendingOrders;
											
											// Group orders by offeringId and sum quantities
											const groupedOrders = new Map();
											activeOrders.forEach((order) => {
											const key = order.offeringId || order.id;
											if (groupedOrders.has(key)) {
												const existing = groupedOrders.get(key);
												existing.quantity = (existing.quantity || 1) + (order.quantity || 1);
												// Keep the most recent order date
												if (order.createdAt && existing.createdAt) {
													const orderDate = new Date(order.createdAt);
													const existingDate = new Date(existing.createdAt);
													if (orderDate > existingDate) {
														existing.createdAt = order.createdAt;
													}
												}
												// Store all order IDs for cancellation
												if (!existing.orderIds) {
													existing.orderIds = [existing.id];
												}
												existing.orderIds.push(order.id);
											} else {
												// Ensure order has all required fields
												const enrichedOrder = {
													...order,
													offeringTitle: order.offeringTitle || getOfferingTitle(order.offeringId) || 'Prasadam order',
													quantity: order.quantity || 1,
													status: order.status || 'pending',
													feeCents: order.feeCents || 0,
													feeRefundEligible: order.feeRefundEligible !== undefined ? order.feeRefundEligible : true,
													orderIds: [order.id], // Store order ID for cancellation
												};
												groupedOrders.set(key, enrichedOrder);
											}
										});
										
											const displayOrders = Array.from(groupedOrders.values());
											
											// Ensure currentOrderIndex is within bounds - use a safe index for display
											const safeIndex = displayOrders.length > 0 
												? Math.min(currentOrderIndex, Math.max(0, displayOrders.length - 1))
												: 0;
											
											if (displayOrders.length === 0) {
												return (
													<div className="card-empty">You don&apos;t have any pending orders.</div>
												);
											}
											
											return (
												<>
													<div className="carousel-container">
														{displayOrders.map((order, index) => {
															const canCancel = order.status && 
														!['collected', 'completed', 'cancelled', 'refunded'].includes(order.status.toLowerCase());
													const isCancelling = cancellingOrderId === order.id;
															const isActive = index === safeIndex;
															if (!isActive) return null;
															
															return (
																<div
																	key={order.id}
																	className={`carousel-slide ${isActive ? 'active' : ''}`}
																>
																	<div className="order-item">
																<div className="order-header-with-icon">
																	<div>
																		<h4>{order.offeringTitle || 'Prasadam order'}</h4>
																		<p className="muted">Placed {formatDateTime(order.createdAt)}</p>
																	</div>
																	<button
																		className="order-details-icon-btn"
																		onClick={() => handleShowOrder(order)}
																		aria-label="View order details"
																		title="View details"
																	>
																		<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
																			<path d="M10 10C11.3807 10 12.5 8.88071 12.5 7.5C12.5 6.11929 11.3807 5 10 5C8.61929 5 7.5 6.11929 7.5 7.5C7.5 8.88071 8.61929 10 10 10Z" stroke="currentColor" strokeWidth="1.5"/>
																			<path d="M10 15C13.866 15 17 12.866 17 9C17 5.13401 13.866 3 10 3C6.13401 3 3 5.13401 3 9C3 12.866 6.13401 15 10 15Z" stroke="currentColor" strokeWidth="1.5"/>
																			<path d="M10 10V15" stroke="currentColor" strokeWidth="1.5"/>
																		</svg>
																	</button>
																</div>
																<div className="order-meta">
																	<div>
																		<span className="meta-label">Quantity</span>
																		<span className="meta-value">{order.quantity || 1}</span>
																	</div>
																	<div>
																		<span className="meta-label">Status</span>
																		<span className={`meta-value status-badge ${getStatusColorClass(order.status)}`}>
																			{formatStatus(order.status)}
																		</span>
																	</div>
																	<div>
																		<span className="meta-label">Reservation Fee</span>
																		<span className="meta-value">{formatCurrency(order.feeCents)}</span>
																	</div>
																	<div>
																		<span className="meta-label">Refund</span>
																		<span className="meta-value">
																			{order.feeRefundEligible ? 'Launch refund' : 'Non-refundable'}
																		</span>
																	</div>
																</div>
																{order.collectedAt && (
																	<div className="order-collected">
																		<span className="meta-label">Collected</span>
																		<span className="meta-value">{formatDateTime(order.collectedAt)}</span>
																	</div>
																)}
																{order.qrToken && (
																	<div className="order-qr">
																		<span className="meta-label">Pickup QR</span>
																		<div className="order-qr-code">
																			<QRCode value={order.qrToken} size={96} />
																		</div>
																	</div>
																)}
																{canCancel && (
																	<div className="order-actions">
																		{order.orderIds && order.orderIds.length > 1 ? (
																			<div className="order-cancel-info">
																				<p className="muted">This order includes {order.orderIds.length} separate reservations</p>
																				<div className="order-cancel-buttons">
																					{order.orderIds.map((orderId) => (
																						<button
																							key={orderId}
																							className="btn btn-secondary btn-small"
																							onClick={() => handleCancelOrder(orderId)}
																							disabled={cancellingOrderId === orderId}
																						>
																							{cancellingOrderId === orderId ? 'Cancelling...' : `Cancel Reservation ${order.orderIds.indexOf(orderId) + 1}`}
																						</button>
																					))}
																				</div>
																			</div>
																		) : (
																			<button
																				className="btn btn-secondary btn-small"
																				onClick={() => handleCancelOrder(order.id)}
																				disabled={isCancelling}
																			>
																				{isCancelling ? 'Cancelling...' : 'Cancel Order'}
																			</button>
																		)}
																	</div>
																)}
															</div>
														</div>
													);
												})}
											</div>
											
											{displayOrders.length > 1 && (
												<div className="carousel-controls">
													<button
														className="carousel-btn carousel-btn-prev"
														onClick={() => setCurrentOrderIndex((prev) => (prev > 0 ? prev - 1 : displayOrders.length - 1))}
														aria-label="Previous order"
													>
														<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
															<path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
														</svg>
													</button>
													<div className="carousel-indicators">
														{displayOrders.map((_, index) => (
															<button
																key={index}
																className={`carousel-indicator ${index === safeIndex ? 'active' : ''}`}
																onClick={() => setCurrentOrderIndex(index)}
																aria-label={`Go to order ${index + 1}`}
															/>
														))}
													</div>
													<button
														className="carousel-btn carousel-btn-next"
														onClick={() => setCurrentOrderIndex((prev) => (prev < displayOrders.length - 1 ? prev + 1 : 0))}
														aria-label="Next order"
													>
														<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
															<path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
														</svg>
													</button>
												</div>
											)}
											
											<div className="carousel-counter">
												{safeIndex + 1} of {displayOrders.length}
											</div>
										</>
									);
								})()}
							</div>
						);
					})()}
						</section>
						)}

						{/* Announcements Section - Below Available Prasadam */}
						<section className="dashboard-card announcements-card">
							<div className="card-header">
								<div>
									<h2>Upcoming Announcements</h2>
									<p className="muted">See what prasadam is coming soon.</p>
								</div>
							</div>
							{announcementsLoading ? (
								<div className="card-loading">Loading announcements...</div>
							) : announcementsError ? (
								<div className="card-error">{announcementsError}</div>
							) : studentAnnouncements.length === 0 ? (
								<div className="card-empty">
									No upcoming announcements. Check back later!
								</div>
							) : (() => {
								const totalAnnouncementsPages = Math.ceil(studentAnnouncements.length / announcementsPerPage);
								const safeIndex = Math.min(announcementsCurrentPage - 1, Math.max(0, studentAnnouncements.length - 1));
								const currentAnnouncement = studentAnnouncements[safeIndex];
								
								return (
									<div className="announcements-carousel">
										<div className="carousel-container">
											<div className="carousel-slide active">
												<div className="offering-item">
													<div className="offering-header">
														<h3>{currentAnnouncement.title}</h3>
													</div>
													<p className="muted">{currentAnnouncement.description || 'More details coming soon.'}</p>
													<div className="offering-meta">
														<div>
															<span className="meta-label">Scheduled for</span>
															<span className="meta-value">{formatDateTime(currentAnnouncement.scheduledAt)}</span>
														</div>
													</div>
													{currentAnnouncement.notes && (
														<div className="note">{currentAnnouncement.notes}</div>
													)}
												</div>
											</div>
										</div>

										{studentAnnouncements.length > 1 && (
											<div className="carousel-controls">
												<button
													className="carousel-btn carousel-btn-prev"
													onClick={() => setAnnouncementsCurrentPage((prev) => (prev > 1 ? prev - 1 : totalAnnouncementsPages))}
													aria-label="Previous announcement"
												>
													<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
														<path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
													</svg>
												</button>
												<div className="carousel-indicators">
													{studentAnnouncements.map((_, index) => (
														<button
															key={index}
															className={`carousel-indicator ${index === safeIndex ? 'active' : ''}`}
															onClick={() => setAnnouncementsCurrentPage(index + 1)}
															aria-label={`Go to announcement ${index + 1}`}
														/>
													))}
												</div>
												<button
													className="carousel-btn carousel-btn-next"
													onClick={() => setAnnouncementsCurrentPage((prev) => (prev < totalAnnouncementsPages ? prev + 1 : 1))}
													aria-label="Next announcement"
												>
													<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
														<path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
													</svg>
												</button>
											</div>
										)}

										<div className="carousel-counter">
											{safeIndex + 1} of {studentAnnouncements.length}
										</div>
									</div>
								);
							})()}
						</section>
					</div>

					{selectedOrder && (
						<div className="modal-overlay" onClick={handleCloseOrderModal}>
							<div className="modal-content" onClick={(e) => e.stopPropagation()}>
								<div className="modal-header">
									<h3>Order Details</h3>
									<button className="modal-close-btn" onClick={handleCloseOrderModal} aria-label="Close">
										<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
											<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
										</svg>
									</button>
								</div>
								<div className="order-details">
									<h4>{selectedOrder.offeringTitle}</h4>
									<p className="muted">Order ID: {selectedOrder.id}</p>
									<p className="muted">Placed: {formatDateTime(selectedOrder.createdAt)}</p>
									<p className="muted">Quantity: {selectedOrder.quantity || 1}</p>
									<p className="muted">Reservation Fee: {formatCurrency(selectedOrder.feeCents)}</p>
									<p className="muted">Refund Eligible: {selectedOrder.feeRefundEligible ? 'Yes' : 'No'}</p>
									{selectedOrder.qrToken && (
										<div className="order-qr-large">
											<h5>Show this at pickup</h5>
											<div className="order-qr-code">
												<QRCode value={selectedOrder.qrToken} size={140} />
											</div>
											<p className="muted">Token: {selectedOrder.qrToken}</p>
										</div>
									)}
									<p className="muted">
										Status: <span className={`status-badge ${getStatusColorClass(selectedOrder.status)}`}>
											{formatStatus(selectedOrder.status)}
										</span>
									</p>
									{selectedOrder.collectedAt && (
										<p className="muted">Collected: {formatDateTime(selectedOrder.collectedAt)}</p>
									)}
									{selectedOrder.cancelledAt && (
										<p className="muted">Cancelled: {formatDateTime(selectedOrder.cancelledAt)}</p>
									)}
									<div className="order-actions">
										{selectedOrder.status && 
											!['collected', 'completed', 'cancelled', 'refunded'].includes(selectedOrder.status.toLowerCase()) && (
											<button 
												className="btn btn-secondary" 
												onClick={() => handleCancelOrder(selectedOrder.id)}
												disabled={cancellingOrderId === selectedOrder.id}
											>
												{cancellingOrderId === selectedOrder.id ? 'Cancelling...' : 'Cancel Order'}
											</button>
										)}
										<button className="btn btn-secondary" onClick={handleCloseOrderModal}>
											Close
										</button>
									</div>
								</div>
							</div>
						</div>
					)}

				</div>
			) : currentPage === 'orders' ? (
				<div className="profile-page">
					<header className="profile-page-header">
						<h1>All Orders</h1>
						<p className="muted">View all your order history</p>
					</header>
					<div className="profile-page-content">
						<div className="dashboard-card">
							<div className="card-header">
								<h3>Your Orders</h3>
							</div>
							{ordersLoading ? (
								<div className="card-loading">Loading orders...</div>
							) : ordersError ? (
								<div className="card-error">{ordersError}</div>
							) : (() => {
								// Show all orders (pending, cancelled, completed)
								const allOrdersList = orders.map((order) => ({
									...order,
									offeringTitle: order.offeringTitle || getOfferingTitle(order.offeringId) || 'Prasadam order',
									quantity: order.quantity || 1,
									status: order.status || 'pending',
									feeCents: order.feeCents || 0,
								}));

								// Calculate pagination
								const totalPages = Math.ceil(allOrdersList.length / allOrdersPerPage);
								const startIndex = (allOrdersCurrentPage - 1) * allOrdersPerPage;
								const endIndex = startIndex + allOrdersPerPage;
								const paginatedOrders = allOrdersList.slice(startIndex, endIndex);

								// Reset to page 1 if current page is out of bounds
								if (allOrdersCurrentPage > totalPages && totalPages > 0) {
									setAllOrdersCurrentPage(1);
								}

								if (allOrdersList.length === 0) {
									return (
										<div className="card-empty">You haven&apos;t made any orders yet.</div>
									);
								}

								return (
									<>
										<ul className="order-list">
											{paginatedOrders.map((order) => {
												const status = (order.status || '').toLowerCase();
												return (
													<li key={order.id} className="order-item">
														<div className="order-header-with-icon">
															<div>
																<h4>{order.offeringTitle}</h4>
																<p className="muted">Placed {formatDateTime(order.createdAt)}</p>
															</div>
															<button
																className="order-details-icon-btn"
																onClick={() => handleShowOrder(order)}
																aria-label="View order details"
																title="View details"
															>
																<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
																	<path d="M10 10C11.3807 10 12.5 8.88071 12.5 7.5C12.5 6.11929 11.3807 5 10 5C8.61929 5 7.5 6.11929 7.5 7.5C7.5 8.88071 8.61929 10 10 10Z" stroke="currentColor" strokeWidth="1.5"/>
																	<path d="M10 15C13.866 15 17 12.866 17 9C17 5.13401 13.866 3 10 3C6.13401 3 3 5.13401 3 9C3 12.866 6.13401 15 10 15Z" stroke="currentColor" strokeWidth="1.5"/>
																	<path d="M10 10V15" stroke="currentColor" strokeWidth="1.5"/>
																</svg>
															</button>
														</div>
														<div className="order-meta">
															<div>
																<span className="meta-label">Quantity</span>
																<span className="meta-value">{order.quantity || 1}</span>
															</div>
															<div>
																<span className="meta-label">Status</span>
																<span className={`meta-value status-badge ${getStatusColorClass(order.status)}`}>
																	{formatStatus(order.status)}
																</span>
															</div>
															<div>
																<span className="meta-label">Reservation Fee</span>
																<span className="meta-value">{formatCurrency(order.feeCents)}</span>
															</div>
															<div>
																<span className="meta-label">Refund</span>
																<span className="meta-value">
																	{order.feeRefundEligible ? 'Launch refund' : 'Non-refundable'}
																</span>
															</div>
														</div>
														{order.collectedAt && (
															<div className="order-collected">
																<span className="meta-label">Collected</span>
																<span className="meta-value">{formatDateTime(order.collectedAt)}</span>
															</div>
														)}
														{order.cancelledAt && (
															<div className="order-collected">
																<span className="meta-label">Cancelled</span>
																<span className="meta-value">{formatDateTime(order.cancelledAt)}</span>
															</div>
														)}
														{order.qrToken && (
															<div className="order-qr">
																<span className="meta-label">Pickup QR</span>
																<div className="order-qr-code">
																	<QRCode value={order.qrToken} size={96} />
																</div>
															</div>
														)}
													</li>
												);
											})}
										</ul>
										<div className="pagination-controls">
											<div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
												<label style={{ fontSize: '14px', color: 'var(--muted)' }}>
													Items per page:
												</label>
												<select
													className="input"
													value={allOrdersPerPage}
													onChange={(e) => {
														const newPerPage = Number.parseInt(e.target.value, 10);
														setAllOrdersPerPage(newPerPage);
														setAllOrdersCurrentPage(1); // Reset to first page when changing items per page
													}}
													style={{ width: '80px', padding: '6px 8px' }}
												>
													<option value="1">1</option>
													<option value="3">3</option>
													<option value="5">5</option>
													<option value="10">10</option>
													<option value="20">20</option>
												</select>
											</div>
											{totalPages > 1 && (
												<div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
													<button
														className="btn btn-secondary btn-small"
														onClick={() => setAllOrdersCurrentPage((prev) => Math.max(1, prev - 1))}
														disabled={allOrdersCurrentPage === 1}
													>
														Previous
													</button>
													<span className="pagination-info">
														Page {allOrdersCurrentPage} of {totalPages} ({allOrdersList.length} total)
													</span>
													<button
														className="btn btn-secondary btn-small"
														onClick={() => setAllOrdersCurrentPage((prev) => Math.min(totalPages, prev + 1))}
														disabled={allOrdersCurrentPage === totalPages}
													>
														Next
													</button>
												</div>
											)}
										</div>
									</>
								);
							})()}
						</div>
					</div>
				</div>
			) : (
				<div className="profile-page">
					<header className="profile-page-header">
						<h1>Profile</h1>
						<p className="muted">Manage your account information</p>
					</header>
					<div className="profile-page-content">
						<div className="dashboard-card profile-card">
							{profileLoading ? (
								<div className="card-loading">Loading profile...</div>
							) : profileError ? (
								<div className="card-error">{profileError}</div>
							) : userProfile ? (
								<div className="profile-details">
									{!isEditing ? (
										<>
											<div className="profile-item">
												<div className="profile-label">Name</div>
												<div className="profile-value">{userProfile.name || 'Not provided'}</div>
											</div>
											<div className="profile-item">
												<div className="profile-label">Email</div>
												<div className="profile-value">{userProfile.email || 'Not provided'}</div>
											</div>
											<div className="profile-item">
												<div className="profile-label">Phone Number</div>
												<div className="profile-value">{userProfile.phoneNumber || 'Not provided'}</div>
												<div className="profile-note">Phone number cannot be changed</div>
											</div>
											<div className="profile-item">
												<div className="profile-label">Address</div>
												<div className="profile-value">{userProfile.address || 'Not provided'}</div>
											</div>
											<div className="profile-actions">
												<button className="btn" onClick={handleEdit}>Edit Profile</button>
											</div>
										</>
									) : (
										<form onSubmit={handleSave} className="profile-edit-form">
											<div className="profile-item">
												<label className="profile-label" htmlFor="edit-name">Name</label>
												<input
													id="edit-name"
													type="text"
													className="input"
													value={editForm.name}
													onChange={(e) => handleInputChange('name', e.target.value)}
													required
												/>
											</div>
											<div className="profile-item">
												<label className="profile-label" htmlFor="edit-email">Email</label>
												<input
													id="edit-email"
													type="email"
													className="input"
													value={editForm.email}
													onChange={(e) => handleInputChange('email', e.target.value)}
													required
												/>
											</div>
											<div className="profile-item">
												<label className="profile-label">Phone Number</label>
												<div className="profile-value">{userProfile.phoneNumber || 'Not provided'}</div>
												<div className="profile-note">Phone number cannot be changed</div>
											</div>
											<div className="profile-item">
												<label className="profile-label" htmlFor="edit-address">Address</label>
												<input
													id="edit-address"
													type="text"
													className="input"
													value={editForm.address}
													onChange={(e) => handleInputChange('address', e.target.value)}
													required
												/>
											</div>
											{saveError && <div className="profile-error">{saveError}</div>}
											{saveSuccess && <div className="profile-success">Profile updated successfully!</div>}
											<div className="profile-actions">
												<button type="button" className="btn btn-secondary" onClick={handleCancel} disabled={saving}>
													Cancel
												</button>
												<button type="submit" className="btn" disabled={saving}>
													{saving ? 'Saving...' : 'Save Changes'}
												</button>
											</div>
										</form>
									)}
								</div>
							) : (
								<div className="card-empty">Profile information unavailable.</div>
							)}
						</div>

						{/* Subscription Card - Separate */}
						{subscriptionActive && (
							<div className="dashboard-card subscription-card">
								<div className="card-header">
									<h3>Your Subscription</h3>
									<p className="muted">Manage your subscription status.</p>
								</div>
								<div className="subscription-details">
									<p>
										Subscription: {subscriptionActive ? 'Active' : 'Inactive'}
										{subscriptionWaived && ' (Waived)'}
									</p>
									<p>
										Renews on: {subscriptionRenewal ? formatDateTime(subscriptionRenewal) : 'N/A'}
									</p>
									<button
										className="btn"
										onClick={() => handleSubscription(subscriptionActive ? 'deactivate' : 'activate')}
										disabled={subscriptionUpdating}
									>
										{subscriptionUpdating ? 'Updating...' : subscriptionActive ? 'Deactivate Subscription' : 'Activate Subscription'}
									</button>
									{subscriptionError && <div className="card-error">{subscriptionError}</div>}
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Confirmation Modal */}
			{confirmModal && (
				<div className="modal-overlay" onClick={confirmModal.onCancel}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h3>{confirmModal.title || 'Confirm Action'}</h3>
							<button className="modal-close-btn" onClick={confirmModal.onCancel} aria-label="Close">
								<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
								</svg>
							</button>
						</div>
						<div className="modal-body">
							<p>{confirmModal.message}</p>
						</div>
						<div className="modal-actions">
							<button className="btn btn-secondary" onClick={confirmModal.onCancel}>
								Cancel
							</button>
							<button className="btn btn-danger" onClick={confirmModal.onConfirm}>
								{confirmModal.confirmText || 'Confirm'}
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}


