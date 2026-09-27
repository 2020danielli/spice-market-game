import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// No StrictMode: its double-invoked effects would start two bot searches per turn.
createRoot(document.getElementById('root')!).render(<App />);
