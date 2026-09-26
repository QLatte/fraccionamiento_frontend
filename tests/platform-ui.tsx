import { createRoot } from 'react-dom/client';
import { Platform } from '../src/pages/Platform';
import '../src/styles.css';
createRoot(document.getElementById('root')!).render(<main style={{ padding: 24 }}><Platform/></main>);
