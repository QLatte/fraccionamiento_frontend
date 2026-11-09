import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminPayments, ResidentPayments } from '../src/pages/Payments';
import '../src/styles.css';
createRoot(document.getElementById('root')!).render(location.pathname === '/admin' ? <AdminPayments accountId="00000000-0000-4000-8000-000000000001" enabled refresh={() => {}}/> : <ResidentPayments propertyId="home"/>);
