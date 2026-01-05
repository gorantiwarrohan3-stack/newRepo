import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App.jsx';
import Login from './Login.jsx';
import SupplyOwnerLogin from './SupplyOwnerLogin.jsx';
import './styles.css';

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/src/sw.js').catch(() => {
			// no-op
		});
	});
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
	<React.StrictMode>
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<Navigate to="/student/login" replace />} />
				<Route path="/student/login" element={<Login />} />
				<Route path="/supply-owner/login" element={<SupplyOwnerLogin />} />
				<Route path="/student/*" element={<App />} />
				<Route path="/supply-owner/*" element={<App />} />
			</Routes>
		</BrowserRouter>
	</React.StrictMode>
);


