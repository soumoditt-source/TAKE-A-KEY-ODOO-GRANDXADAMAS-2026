'use client';

import dynamic from 'next/dynamic';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { apiFetch } from '../lib/api';
import { RideMatch, Trip, User, useRideStore, Vehicle, WorkspaceView } from '../store/useRideStore';
import { AnimatePresence } from 'framer-motion';
import IntroScreen from '../components/IntroScreen';

const MapView = dynamic(() => import('../components/MapView'), { ssr: false });

type RideSummary = {
  id: string;
  driver_name: string;
  departure_time: string;
  available_seats: number;
  fare: number;
  status: string;
  license_plate: string;
  vehicle_type: string;
};

type RideRequest = {
  id: string;
  passenger_name: string;
  passenger_email: string;
  bid_fare: number;
  seats_requested: number;
  departure_time: string;
};

type WalletData = {
  balance: number;
  transactions: { id: string; amount: number; type: string; status: string; created_at: string }[];
};

type FleetData = {
  metrics: { employees: number; vehicles: number; revenue: number };
  fleet: { id: string; license_plate: string; capacity: number; vehicle_type: string; owner: string }[];
};

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/60 focus:bg-white/[0.07]';
const demoAccounts = [
  ['Arup Roy', 'Admin · TCS Kolkata', 'arup.roy@tcs.com', 'lime'],
  ['Vikram Sen', 'Employee · TCS Kolkata', 'vikram.sen@tcs.com', 'sky'],
  ['Sneha Das', 'Employee · Cognizant Kolkata', 'sneha.das@cognizant.com', 'amber'],
] as const;
const navItems: { id: WorkspaceView; label: string; glyph: string }[] = [
  { id: 'find', label: 'Find a ride', glyph: '↗' },
  { id: 'offer', label: 'Offer a ride', glyph: '+' },
  { id: 'trips', label: 'My trips', glyph: '⌁' },
  { id: 'requests', label: 'Requests', glyph: '◌' },
  { id: 'vehicles', label: 'Vehicles', glyph: '▣' },
  { id: 'wallet', label: 'Wallet', glyph: '₹' },
  { id: 'reports', label: 'Reports', glyph: '▥' },
  { id: 'settings', label: 'Settings', glyph: '⚙' },
];

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function initials(value: string) {
  return value.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function Pill({ children, tone = 'sky' }: { children: ReactNode; tone?: 'sky' | 'lime' | 'amber' | 'rose' }) {
  const styles = {
    sky: 'border-sky-300/20 bg-sky-300/10 text-sky-200',
    lime: 'border-lime-300/20 bg-lime-300/10 text-lime-200',
    amber: 'border-amber-300/20 bg-amber-300/10 text-amber-200',
    rose: 'border-rose-300/20 bg-rose-300/10 text-rose-200',
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${styles[tone]}`}>{children}</span>;
}

function Heading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div><p className="eyebrow text-sky-300/80">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{title}</h2></div>
      {detail && <p className="max-w-sm text-right text-xs leading-5 text-slate-500">{detail}</p>}
    </div>
  );
}

function LoginScreen({ onLogin, busy, error }: { onLogin: (email: string, password: string) => void; busy: boolean; error: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <main className="login-shell">
      <div className="login-glow login-glow-one" /><div className="login-glow login-glow-two" />
      <section className="login-card">
        <div className="mb-10 flex items-start justify-between"><div><div className="brand-lockup"><span className="brand-mark">TK</span><span>TAKE-A-KEY</span></div><p className="mt-3 max-w-xs text-sm leading-6 text-slate-400">A calmer commute for teams that move together.</p></div><Pill tone="lime">Local demo</Pill></div>
        <p className="eyebrow text-sky-300">Workspace access</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Welcome back.</h1><p className="mt-2 text-sm text-slate-500">Use a seeded work email. Passwords are optional in the local demo.</p>
        <form className="mt-7 space-y-3" onSubmit={(event) => { event.preventDefault(); onLogin(email, password); }}><input className={inputClass} type="email" placeholder="name@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required /><input className={inputClass} type="password" placeholder="Password (demo optional)" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="primary-button mt-2 w-full" disabled={busy}>{busy ? 'Opening workspace…' : 'Continue to workspace ↗'}</button></form>
        {error && <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}
        <div className="my-7 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-slate-600"><span className="h-px flex-1 bg-white/10" />Demo accounts<span className="h-px flex-1 bg-white/10" /></div>
        <div className="space-y-2">{demoAccounts.map(([name, detail, accountEmail, tone]) => <button key={accountEmail} onClick={() => { setEmail(accountEmail); onLogin(accountEmail, ''); }} className="demo-account"><span className={`demo-avatar ${tone}`}>{initials(name)}</span><span className="flex-1 text-left"><strong>{name}</strong><small>{detail}</small></span><span className="text-slate-600">→</span></button>)}</div>
        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.18em] text-slate-600">Tenant isolated · OSM routing · wallet ready</p>
      </section>
    </main>
  );
}

export default function App() {
  const store = useRideStore();
  const [hasMounted, setHasMounted] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(false);
  const [view, setView] = useState<WorkspaceView>('find');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'lime' | 'rose' | 'sky' } | null>(null);
  const [searchError, setSearchError] = useState('');
  const [selectedMatch, setSelectedMatch] = useState<RideMatch | null>(null);
  const [bidFare, setBidFare] = useState(120);
  const [bidStatus, setBidStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [rides, setRides] = useState<RideSummary[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [wallet, setWallet] = useState<WalletData>({ balance: 0, transactions: [] });
  const [fleet, setFleet] = useState<FleetData | null>(null);
  const [topUpAmount, setTopUpAmount] = useState(500);
  const [offer, setOffer] = useState({ vehicleId: '', departure: '', seats: 1, fare: 120 });
  const [newVehicle, setNewVehicle] = useState({ plate: '', capacity: 4, color: 'Obsidian Black', type: 'Sedan' });

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const refreshWorkspace = async () => {
    if (!store.token) return;
    setWorkspaceLoading(true);
    try {
      const [rideData, tripData, requestData, vehicleData, walletData] = await Promise.all([
        apiFetch<RideSummary[]>('/api/v1/rides', { token: store.token }),
        apiFetch<Trip[]>('/api/v1/trips', { token: store.token }),
        apiFetch<RideRequest[]>('/api/v1/requests', { token: store.token }),
        apiFetch<Vehicle[]>('/api/v1/me/vehicles', { token: store.token }),
        apiFetch<WalletData>('/api/v1/wallet', { token: store.token }),
      ]);
      setRides(rideData); setTrips(tripData); setRequests(requestData); setVehicles(vehicleData); setWallet(walletData);
      if (vehicleData.length && !offer.vehicleId) setOffer((current) => ({ ...current, vehicleId: vehicleData[0].id }));
      if (store.user?.role === 'admin') setFleet(await apiFetch<FleetData>('/api/v1/admin/fleet', { token: store.token }));
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Workspace sync failed.', tone: 'rose' });
    } finally { setWorkspaceLoading(false); }
  };

  useEffect(() => { if (store.token) void refreshWorkspace(); }, [store.token, store.user?.id]);

  const login = async (email: string, password: string) => {
    setLoginBusy(true); setLoginError('');
    try {
      const response = await apiFetch<{ token: string; user: User }>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      store.setAuth(response.token, response.user);
    } catch (error) { setLoginError(error instanceof Error ? error.message : 'Unable to sign in.'); } finally { setLoginBusy(false); }
  };

  const search = async () => {
    if (!store.token || !store.origin || !store.destination) { setSearchError('Click the map once for pickup and once for destination.'); return; }
    store.setSearching(true); setSearchError(''); setBidStatus('idle');
    try {
      const matches = await apiFetch<RideMatch[]>('/api/v1/spatial/match', { method: 'POST', token: store.token, body: JSON.stringify({ pickup_lat: store.origin.lat, pickup_lon: store.origin.lng, dropoff_lat: store.destination.lat, dropoff_lon: store.destination.lng, seats_requested: 1 }) });
      store.setMatches(matches);
      if (matches.length) { setSelectedMatch(matches[0]); setBidFare(matches[0].fare || 120); store.setActiveRoute(matches[0].telemetry, matches[0].ride_id); } else setSearchError('No matching seats in your company network yet.');
    } catch (error) { setSearchError(error instanceof Error ? error.message : 'Route matching failed.'); } finally { store.setSearching(false); }
  };

  const requestSeat = async () => {
    if (!store.token || !selectedMatch || !store.origin || !store.destination) return;
    setBidStatus('sending');
    try {
      await apiFetch('/api/v1/ride/request', { method: 'POST', token: store.token, body: JSON.stringify({ ride_id: selectedMatch.ride_id, bid_fare: bidFare, seats_requested: 1, pickup_lat: store.origin.lat, pickup_lon: store.origin.lng, drop_lat: store.destination.lat, drop_lon: store.destination.lng }) });
      setBidStatus('sent'); setNotice({ text: 'Request sent. The driver can approve it from Requests.', tone: 'lime' }); await refreshWorkspace();
    } catch (error) { setBidStatus('error'); setNotice({ text: error instanceof Error ? error.message : 'Request failed.', tone: 'rose' }); }
  };

  const publishRide = async (event: FormEvent) => {
    event.preventDefault();
    if (!store.token || !store.origin || !store.destination) { setNotice({ text: 'Set both route pins before publishing.', tone: 'rose' }); return; }
    try {
      await apiFetch('/api/v1/rides/offer', { method: 'POST', token: store.token, body: JSON.stringify({ vehicle_id: offer.vehicleId, origin_lat: store.origin.lat, origin_lon: store.origin.lng, dest_lat: store.destination.lat, dest_lon: store.destination.lng, departure_time: offer.departure, available_seats: offer.seats, fare: offer.fare }) });
      setNotice({ text: 'Ride published to your company network.', tone: 'lime' }); setView('trips'); await refreshWorkspace();
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Unable to publish ride.', tone: 'rose' }); }
  };

  const acceptRequest = async (requestId: string) => {
    try { await apiFetch('/api/v1/ride/accept', { method: 'POST', token: store.token, body: JSON.stringify({ request_id: requestId }) }); setNotice({ text: 'Passenger confirmed and the seat was reserved atomically.', tone: 'lime' }); await refreshWorkspace(); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Unable to approve request.', tone: 'rose' }); }
  };

  const payTrip = async (bookingId: string) => {
    try { await apiFetch(`/api/v1/wallet/pay/${bookingId}`, { method: 'POST', token: store.token }); setNotice({ text: 'Payment completed from your wallet.', tone: 'lime' }); await refreshWorkspace(); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Payment could not be completed.', tone: 'rose' }); }
  };

  const topUp = async () => {
    try { await apiFetch('/api/v1/wallet/top-up', { method: 'POST', token: store.token, body: JSON.stringify({ amount: topUpAmount }) }); setNotice({ text: `Wallet topped up by ₹${topUpAmount}.`, tone: 'lime' }); await refreshWorkspace(); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Wallet update failed.', tone: 'rose' }); }
  };

  const addVehicle = async (event: FormEvent) => {
    event.preventDefault();
    try { await apiFetch('/api/v1/me/vehicles', { method: 'POST', token: store.token, body: JSON.stringify({ license_plate: newVehicle.plate, capacity: newVehicle.capacity, color: newVehicle.color, vehicle_type: newVehicle.type }) }); setNewVehicle({ plate: '', capacity: 4, color: 'Obsidian Black', type: 'Sedan' }); setNotice({ text: 'Vehicle added to your fleet.', tone: 'lime' }); await refreshWorkspace(); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Vehicle could not be added.', tone: 'rose' }); }
  };

  const stats = useMemo(() => [
    ['Open rides', rides.filter((ride) => ride.status === 'scheduled' || ride.status === 'active').length, 'In your network'],
    ['My trips', trips.length, 'Booked journeys'],
    ['Wallet', `₹${Math.round(wallet.balance).toLocaleString('en-IN')}`, 'Available balance'],
  ], [rides, trips, wallet.balance]);

  if (!hasMounted) {
    return (
      <main className="login-shell" suppressHydrationWarning>
        <section className="login-card">
          <div className="brand-lockup">
            <span className="brand-mark">TK</span>
            <span>TAKE-A-KEY</span>
          </div>
        </section>
      </main>
    );
  }

  if (!store.user) {
    return (
      <>
        <AnimatePresence>
          {!introDismissed && <IntroScreen key="intro" onOpen={() => setIntroDismissed(true)} />}
        </AnimatePresence>
        <LoginScreen onLogin={login} busy={loginBusy} error={loginError} />
      </>
    );
  }

  const findView = (
    <><Heading eyebrow="Find a ride" title="Move through the city, together." detail="Drop two pins. We rank the lowest-detour routes across your company fleet." /><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_410px]"><div className="min-h-[560px]"><MapView /></div><div className="panel flex max-h-[680px] flex-col"><div className="mb-4 grid grid-cols-2 gap-2"><div className="route-chip pickup"><small>Pickup</small><strong>{store.origin ? `${store.origin.lat.toFixed(4)}, ${store.origin.lng.toFixed(4)}` : 'Click the map'}</strong></div><div className="route-chip dropoff"><small>Destination</small><strong>{store.destination ? `${store.destination.lat.toFixed(4)}, ${store.destination.lng.toFixed(4)}` : 'Click the map'}</strong></div></div><div className="flex gap-2"><button onClick={search} disabled={store.isSearching} className="primary-button flex-1">{store.isSearching ? 'Computing routes…' : 'Find best match ↗'}</button><button onClick={() => { store.setOrigin(null); store.setDestination(null); store.setMatches([]); store.setActiveRoute(null); setSelectedMatch(null); }} className="secondary-button">Reset</button></div>{searchError && <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/10 p-3 text-xs text-rose-100">{searchError}</p>}<div className="mt-5 flex-1 space-y-3 overflow-y-auto pr-1">{store.matches.length === 0 ? <div className="empty-state"><span className="empty-icon">↗</span><strong>Routes appear here</strong><p>Live road geometry when online; predictable local scoring when offline.</p></div> : store.matches.map((match) => { const selected = selectedMatch?.ride_id === match.ride_id; return <div key={match.ride_id} className={`ride-card ${selected ? 'selected' : ''}`}><button className="w-full text-left" onClick={() => { setSelectedMatch(match); setBidFare(match.fare || 120); store.setActiveRoute(match.telemetry, match.ride_id); setBidStatus('idle'); }}><div className="flex items-start gap-3"><span className="profile-avatar small">{initials(match.driver_name)}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{match.driver_name}</strong><small className="mt-1 block text-[10px] uppercase tracking-[0.12em] text-slate-500">{match.vehicle_type} · {match.license_plate}</small></span><span className="text-right"><strong className="block text-lg text-white">{Math.max(1, Math.round(match.telemetry.pickup_eta_seconds / 60))}<small className="ml-1 text-[9px] text-slate-500">MIN</small></strong><small className="text-[10px] text-lime-200">₹{match.fare || bidFare}</small></span></div><div className="mt-4 flex items-center justify-between text-[10px] uppercase tracking-[0.13em] text-slate-500"><span><i className="legend-dot bg-lime-300" />{match.available_seats} seats open</span><span>{match.detour_km.toFixed(1)} km detour</span></div></button>{selected && <div className="mt-4 border-t border-white/10 pt-4"><div className="mb-3 flex items-center justify-between"><span className="eyebrow">Your offer per seat</span><strong className="text-lg text-white">₹{bidFare}</strong></div><input type="range" min="50" max="500" step="10" value={bidFare} onChange={(event) => setBidFare(Number(event.target.value))} className="mb-4 w-full accent-sky-300" /><button onClick={requestSeat} disabled={bidStatus === 'sending' || bidStatus === 'sent'} className="secondary-button w-full">{bidStatus === 'sending' ? 'Sending request…' : bidStatus === 'sent' ? 'Request sent · awaiting driver' : bidStatus === 'error' ? 'Try request again' : 'Request this ride'}</button></div>}</div>; })}</div></div></div></>
  );

  const content: Record<WorkspaceView, ReactNode> = {
    find: findView,
    offer: <><Heading eyebrow="Offer a ride" title="Turn an empty seat into a better commute." detail="Publish to your company network with transparent pricing and capacity." /><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]"><div className="min-h-[560px]"><MapView /></div><form onSubmit={publishRide} className="panel space-y-5"><div><p className="eyebrow">Route</p><p className="mt-2 text-xs leading-5 text-slate-500">Set pickup and destination pins on the map.</p></div><div className="grid grid-cols-2 gap-3"><div className="route-chip pickup">A · {store.origin ? `${store.origin.lat.toFixed(3)}, ${store.origin.lng.toFixed(3)}` : 'Not set'}</div><div className="route-chip dropoff">B · {store.destination ? `${store.destination.lat.toFixed(3)}, ${store.destination.lng.toFixed(3)}` : 'Not set'}</div></div><label className="field-label">Vehicle<select className={inputClass} value={offer.vehicleId} onChange={(event) => setOffer({ ...offer, vehicleId: event.target.value })} required><option value="">Select a vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.license_plate} · {vehicle.vehicle_type} · {vehicle.capacity} seats</option>)}</select></label><label className="field-label">Departure<input className={inputClass} type="datetime-local" value={offer.departure} onChange={(event) => setOffer({ ...offer, departure: event.target.value })} required /></label><div className="grid grid-cols-2 gap-3"><label className="field-label">Seats<input className={inputClass} type="number" min="1" max="60" value={offer.seats} onChange={(event) => setOffer({ ...offer, seats: Number(event.target.value) })} /></label><label className="field-label">Fare / seat<input className={inputClass} type="number" min="0" value={offer.fare} onChange={(event) => setOffer({ ...offer, fare: Number(event.target.value) })} /></label></div><button className="primary-button w-full" disabled={!vehicles.length}>Publish ride ↗</button>{!vehicles.length && <p className="text-xs text-amber-200">Add a vehicle first from Vehicles.</p>}</form></div></>,
    trips: <><Heading eyebrow="My trips" title="Your commute ledger." detail="Bookings, payment status, driver details, and route context." /><div className="space-y-3">{trips.length === 0 ? <div className="panel empty-state"><span className="empty-icon">⌁</span><strong>No booked trips yet</strong><p>Find a ride and request a seat. Approved bookings appear here.</p></div> : trips.map((trip) => <div key={trip.booking_id} className="panel flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-4"><span className="profile-avatar">{initials(trip.driver_name)}</span><div><p className="text-sm font-semibold text-white">{trip.driver_name}</p><p className="mt-1 text-xs text-slate-500">{trip.license_plate} · {trip.vehicle_type} · {formatDate(trip.departure_time)}</p><p className="mt-2 text-xs text-slate-400">{trip.origin_lat.toFixed(3)}, {trip.origin_lon.toFixed(3)} <span className="mx-2 text-slate-600">→</span> {trip.dest_lat.toFixed(3)}, {trip.dest_lon.toFixed(3)}</p></div></div><div className="flex items-center gap-3"><Pill tone={trip.payment_status === 'completed' ? 'lime' : 'amber'}>{trip.payment_status === 'completed' ? 'Paid' : 'Payment due'}</Pill><strong className="text-lg text-white">₹{trip.fare}</strong>{trip.payment_status !== 'completed' && <button onClick={() => payTrip(trip.booking_id)} className="secondary-button">Pay from wallet</button>}</div></div>)}</div></>,
    requests: <><Heading eyebrow="Driver console" title="Requests waiting on you." detail="Approvals reserve seats in one transaction, preventing overbooking." /><div className="space-y-3">{requests.length === 0 ? <div className="panel empty-state"><span className="empty-icon">◌</span><strong>All clear</strong><p>Passenger requests for your rides appear here.</p></div> : requests.map((request) => <div key={request.id} className="panel flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-semibold text-white">{request.passenger_name} <span className="ml-2 text-xs font-normal text-slate-500">{request.passenger_email}</span></p><p className="mt-2 text-xs text-slate-500">{formatDate(request.departure_time)} · {request.seats_requested} seat · offered ₹{request.bid_fare}</p></div><button onClick={() => acceptRequest(request.id)} className="primary-button">Approve passenger ↗</button></div>)}</div></>,
    vehicles: <><Heading eyebrow="My vehicles" title="The fleet behind every seat." detail="Keep capacity and vehicle identity current for safer matching." /><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="grid gap-3 sm:grid-cols-2">{vehicles.map((vehicle) => <div key={vehicle.id} className="panel"><div className="flex items-start justify-between"><span className="vehicle-illustration">▰</span><Pill tone="lime">Active</Pill></div><p className="mt-6 text-lg font-semibold text-white">{vehicle.license_plate}</p><p className="mt-1 text-xs uppercase tracking-[0.15em] text-slate-500">{vehicle.color} · {vehicle.vehicle_type}</p><div className="mt-5 flex justify-between border-t border-white/10 pt-4 text-xs text-slate-400"><span>Capacity</span><strong className="text-white">{vehicle.capacity} seats</strong></div></div>)}{!vehicles.length && <div className="panel empty-state sm:col-span-2"><strong>No vehicles registered</strong><p>Add your first vehicle to offer a ride.</p></div>}</div><form onSubmit={addVehicle} className="panel space-y-4"><p className="eyebrow">Register vehicle</p><label className="field-label">Registration number<input className={inputClass} placeholder="WB02AB1234" value={newVehicle.plate} onChange={(event) => setNewVehicle({ ...newVehicle, plate: event.target.value })} required /></label><div className="grid grid-cols-2 gap-3"><label className="field-label">Capacity<input className={inputClass} type="number" min="1" max="60" value={newVehicle.capacity} onChange={(event) => setNewVehicle({ ...newVehicle, capacity: Number(event.target.value) })} /></label><label className="field-label">Type<select className={inputClass} value={newVehicle.type} onChange={(event) => setNewVehicle({ ...newVehicle, type: event.target.value })}><option>Sedan</option><option>Pool</option><option>Shuttle</option><option>Bus</option></select></label></div><label className="field-label">Color<input className={inputClass} value={newVehicle.color} onChange={(event) => setNewVehicle({ ...newVehicle, color: event.target.value })} /></label><button className="primary-button w-full">Add vehicle ↗</button></form></div></>,
    wallet: <><Heading eyebrow="Wallet" title="Simple, transparent payments." detail="Top up for the ride you need. Your ledger stays attached to the booking." /><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="space-y-4"><div className="wallet-card"><p className="eyebrow">Available balance</p><p className="mt-4 text-5xl font-semibold tracking-tight text-white">₹{wallet.balance.toLocaleString('en-IN')}</p><p className="mt-3 text-xs text-sky-100/60">Private wallet · {store.user.company_id}</p></div><div className="panel"><p className="eyebrow mb-4">Recent activity</p>{wallet.transactions.length === 0 ? <p className="text-sm text-slate-500">No transactions yet.</p> : wallet.transactions.map((transaction) => <div key={transaction.id} className="flex items-center justify-between border-b border-white/10 py-3 last:border-0"><div><p className="text-sm text-slate-200">{transaction.type === 'top_up' ? 'Wallet top up' : 'Ride payment'}</p><p className="mt-1 text-[10px] uppercase tracking-[0.13em] text-slate-600">{formatDate(transaction.created_at)}</p></div><strong className={transaction.type === 'top_up' ? 'text-lime-200' : 'text-slate-200'}>{transaction.type === 'top_up' ? '+' : '-'}₹{transaction.amount}</strong></div>)}</div></div><div className="panel h-fit space-y-4"><p className="eyebrow">Add money</p><p className="text-sm leading-6 text-slate-400">Wallet payment keeps checkout fast after your ride is approved.</p><div className="grid grid-cols-3 gap-2">{[500, 1000, 2000].map((amount) => <button key={amount} onClick={() => setTopUpAmount(amount)} className={`rounded-xl border px-2 py-3 text-xs ${topUpAmount === amount ? 'border-sky-300/50 bg-sky-300/10 text-sky-100' : 'border-white/10 text-slate-400'}`}>₹{amount}</button>)}</div><input className={inputClass} type="number" min="1" value={topUpAmount} onChange={(event) => setTopUpAmount(Number(event.target.value))} /><button onClick={topUp} className="primary-button w-full">Add ₹{topUpAmount} ↗</button></div></div></>,
    reports: <><Heading eyebrow="Reports" title="A better view of shared mobility." detail="Admin insights stay scoped to your organization." />{fleet ? <div className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><div className="stat-card"><p className="eyebrow">Employees</p><p className="mt-2 text-3xl font-semibold text-white">{fleet.metrics.employees}</p></div><div className="stat-card"><p className="eyebrow">Registered vehicles</p><p className="mt-2 text-3xl font-semibold text-white">{fleet.metrics.vehicles}</p></div><div className="stat-card"><p className="eyebrow">Settled revenue</p><p className="mt-2 text-3xl font-semibold text-white">₹{fleet.metrics.revenue}</p></div></div><div className="panel"><p className="eyebrow mb-4">Fleet status</p>{fleet.fleet.map((vehicle) => <div key={vehicle.id} className="flex items-center justify-between border-b border-white/10 py-4 last:border-0"><div><p className="text-sm font-semibold text-white">{vehicle.license_plate}</p><p className="mt-1 text-xs text-slate-500">{vehicle.owner} · {vehicle.vehicle_type} · {vehicle.capacity} seats</p></div><Pill tone="lime">Available</Pill></div>)}</div></div> : <div className="panel empty-state"><span className="empty-icon">▥</span><strong>Admin reports are restricted</strong><p>Sign in as the company admin to inspect fleet signals.</p></div>}</>,
    settings: <><Heading eyebrow="Settings" title="Your mobility preferences." detail="The details that make shared rides feel human." /><div className="grid gap-4 lg:grid-cols-2"><div className="panel space-y-5"><p className="eyebrow">Profile</p><div className="flex items-center gap-4"><span className="profile-avatar large">{initials(store.user.full_name)}</span><div><p className="text-lg font-semibold text-white">{store.user.full_name}</p><p className="mt-1 text-sm text-slate-500">{store.user.email}</p></div></div><div className="setting-row"><span>Company tenant</span><strong>{store.user.company_id}</strong></div><div className="setting-row"><span>Access role</span><Pill tone={store.user.role === 'admin' ? 'lime' : 'sky'}>{store.user.role}</Pill></div></div><div className="panel space-y-4"><p className="eyebrow">Platform guarantees</p><div className="feature-row"><span className="feature-icon">⌁</span><div><strong>Route-aware matching</strong><p>OSM geometry with a deterministic offline fallback.</p></div></div><div className="feature-row"><span className="feature-icon">✓</span><div><strong>Atomic seat allocation</strong><p>Concurrent approvals cannot overbook a vehicle.</p></div></div><div className="feature-row"><span className="feature-icon">◈</span><div><strong>Tenant-first access</strong><p>Every fleet query is scoped to your company.</p></div></div></div></div></>,
  };

  return (
    <>
      <AnimatePresence>
        {!introDismissed && <IntroScreen key="intro" onOpen={() => setIntroDismissed(true)} />}
      </AnimatePresence>
      {view === 'trips' && trips[0] && <div className="fixed bottom-5 right-5 z-[1100] hidden rounded-2xl border border-white/10 bg-[#090d14]/95 p-3 shadow-2xl backdrop-blur-xl sm:block"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.16em] text-slate-500">Latest booking pass</p><div className="rounded-lg bg-white p-2"><QRCodeSVG value={`takeakey://booking/${trips[0].booking_id}?user=${store.user.id}`} size={96} /></div><p className="mt-2 max-w-[112px] truncate text-[9px] text-slate-500">{trips[0].booking_id}</p></div>}
    <main className="app-shell">
      <aside className="sidebar"><div className="brand-lockup px-2"><span className="brand-mark">TK</span><span>TAKE-A-KEY</span></div><div className="mt-12 px-2"><p className="eyebrow">Your workspace</p><div className="mt-3 flex items-center gap-3"><span className="profile-avatar">{initials(store.user.full_name)}</span><span><strong className="block text-sm text-white">{store.user.full_name}</strong><small className="mt-1 block text-[10px] uppercase tracking-[0.12em] text-slate-500">{store.user.company_id}</small></span></div></div><nav className="mt-10 space-y-1">{navItems.map((item) => <button key={item.id} onClick={() => setView(item.id)} className={`nav-item ${view === item.id ? 'active' : ''}`}><span className="nav-glyph">{item.glyph}</span>{item.label}{item.id === 'requests' && requests.length > 0 && <span className="ml-auto rounded-full bg-rose-400 px-1.5 py-0.5 text-[9px] font-bold text-slate-950">{requests.length}</span>}</button>)}</nav><div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="mb-2 flex items-center justify-between"><span className="eyebrow">Network</span><span className="h-2 w-2 rounded-full bg-lime-300 shadow-[0_0_12px_#b8f36b]" /></div><p className="text-xs leading-5 text-slate-400">Private company fleet protected by tenant-aware access rules.</p></div><button onClick={store.logout} className="mt-5 px-2 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:text-white">Sign out ↗</button></aside>
      <div className="mobile-nav"><div className="brand-lockup"><span className="brand-mark">TK</span><span>TAKE-A-KEY</span></div><button onClick={store.logout} className="text-xs text-slate-500">Sign out</button></div>
      <section className="workspace"><header className="topbar"><div><p className="eyebrow">{workspaceLoading ? 'Syncing workspace' : 'Mobility control room'}</p><h1 className="mt-1 text-xl font-semibold text-white">Good to see you, {store.user.full_name.split(' ')[0]}.</h1></div><div className="flex items-center gap-3"><Pill tone={workspaceLoading ? 'amber' : 'lime'}>{workspaceLoading ? 'Syncing' : 'OSM online'}</Pill><span className="hidden text-xs text-slate-500 sm:block">{store.user.role} · {store.user.id}</span></div></header><div className="mobile-tabs">{navItems.slice(0, 5).map((item) => <button key={item.id} onClick={() => setView(item.id)} className={view === item.id ? 'active' : ''}>{item.glyph} {item.label}</button>)}</div><div className="workspace-scroll"><div className="mx-auto max-w-[1500px] px-5 pb-12 pt-6 sm:px-8 lg:px-10"><div className="mb-7 grid gap-3 sm:grid-cols-3">{stats.map(([label, value, hint]) => <div key={label} className="stat-card"><span className="stat-orb sky" /><div><p className="eyebrow">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div></div>)}</div>{notice && <button onClick={() => setNotice(null)} className={`mb-5 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-xs ${notice.tone === 'lime' ? 'border-lime-300/20 bg-lime-300/10 text-lime-100' : notice.tone === 'rose' ? 'border-rose-300/20 bg-rose-300/10 text-rose-100' : 'border-sky-300/20 bg-sky-300/10 text-sky-100'}`}>{notice.text}<span className="text-base opacity-60">×</span></button>}{content[view]}</div></div></section>
    </main>
    </>
  );
}
