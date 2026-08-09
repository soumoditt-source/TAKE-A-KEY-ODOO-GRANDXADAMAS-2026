import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LiveTelemetry {
  driver_lat: number;
  driver_lon: number;
  path_to_pickup: [number, number][];
  pickup_eta_seconds: number;
  distance_km: number;
}

export interface RideMatch {
  ride_id: string;
  driver_id: string;
  driver_name: string;
  vehicle_color: string;
  license_plate: string;
  vehicle_type: string;
  available_seats: number;
  fare: number;
  departure_time: string;
  efficiency_score_seconds: number;
  detour_km: number;
  telemetry: LiveTelemetry;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  company_id: string;
  role: string;
}

export interface Trip {
  booking_id: string;
  ride_id: string;
  seats: number;
  fare: number;
  booking_status: string;
  payment_status: string;
  departure_time: string;
  origin_lat: number;
  origin_lon: number;
  dest_lat: number;
  dest_lon: number;
  ride_status: string;
  driver_name: string;
  driver_email: string;
  license_plate: string;
  vehicle_type: string;
}

export interface Vehicle {
  id: string;
  owner_id: string;
  license_plate: string;
  capacity: number;
  color: string;
  vehicle_type: string;
}

export type WorkspaceView = 'find' | 'offer' | 'trips' | 'requests' | 'vehicles' | 'wallet' | 'reports' | 'settings';

interface RideState {
  token: string | null;
  user: User | null;
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  matches: RideMatch[];
  activeRoute: LiveTelemetry | null;
  activeRideId: string | null;
  isSearching: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  setOrigin: (location: { lat: number; lng: number } | null) => void;
  setDestination: (location: { lat: number; lng: number } | null) => void;
  setMatches: (matches: RideMatch[]) => void;
  setActiveRoute: (route: LiveTelemetry | null, rideId?: string | null) => void;
  setSearching: (searching: boolean) => void;
}

export const useRideStore = create<RideState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      origin: null,
      destination: null,
      matches: [],
      activeRoute: null,
      activeRideId: null,
      isSearching: false,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null, matches: [], activeRoute: null, activeRideId: null, origin: null, destination: null }),
      setOrigin: (origin) => set({ origin }),
      setDestination: (destination) => set({ destination }),
      setMatches: (matches) => set({ matches }),
      setActiveRoute: (activeRoute, activeRideId = null) => set({ activeRoute, activeRideId }),
      setSearching: (isSearching) => set({ isSearching }),
    }),
    {
      name: 'take-a-key-session',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
