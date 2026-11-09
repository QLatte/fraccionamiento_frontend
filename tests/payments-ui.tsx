import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminPayments, ResidentPayments } from '../src/pages/Payments';
import { setToken } from '../src/api';
import '../src/styles.css';
function Fixture() {
  const [home, setHome] = useState('home');
  return <><button onClick={() => setHome(h => h === 'home' ? 'other' : 'home')}>Cambiar vivienda de prueba</button><button onClick={() => setToken(crypto.randomUUID())}>Cambiar sesión de prueba</button><button onClick={() => { setToken(null); setHome('logout'); }}>Salir de prueba</button>{home !== 'logout' && (location.pathname === '/admin' ? <AdminPayments accountId={home === 'home' ? '00000000-0000-4000-8000-000000000001' : '00000000-0000-4000-8000-000000000002'} enabled refresh={() => {}}/> : <ResidentPayments propertyId={home}/>)}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
