import { useSyncExternalStore, type ReactNode } from 'react';
import { financialState, subscribeFinancial } from '../api';
export function FinancialBoundary({ scope, children }: { scope: string; children: ReactNode }) {
  const state = useSyncExternalStore(subscribeFinancial, financialState);
  if (state.endsWith(':true')) return <p role="alert">La información financiera se retiró. Verifica tu sesión y conexión antes de continuar.</p>;
  return <div key={`${state}:${scope}`}>{children}</div>;
}
