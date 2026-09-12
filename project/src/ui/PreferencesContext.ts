import { createContext } from 'react';
import type { Preferences } from '../domain/preferences';
export const PreferencesContext = createContext<Preferences | null>(null);
