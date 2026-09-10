import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ModalProvider } from './components/ModalProvider'
import { AuthProvider } from './context/AuthContext'

if (import.meta.env.PROD) {
  // Reassigning (not calling) these console methods to silence them in
  // production; warn/error are intentionally left untouched.
  /* eslint-disable no-console */
  const noop = () => {}
  console.log = noop
  console.info = noop
  console.debug = noop
  console.trace = noop
  console.table = noop
  console.group = noop
  console.groupCollapsed = noop
  console.groupEnd = noop
  console.dir = noop
  console.dirxml = noop
  console.time = noop
  console.timeEnd = noop
  console.timeLog = noop
  console.clear = noop
  /* eslint-enable no-console */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ModalProvider>
        <App />
      </ModalProvider>
    </AuthProvider>
  </StrictMode>,
)
