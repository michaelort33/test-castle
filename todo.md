# The Castle — Project TODO

## Database & Schema
- [x] Users table with role enum (admin, guest, unapproved_guest), phone field
- [x] Reservations table (user_id, date, start_time, end_time, duration, session_name, contact_phone, contact_email, status, confirmation_code)
- [x] Tournaments table (name, date, details, winner_id)
- [x] Tournament registrations table (tournament_id, user_id)

## Backend API
- [x] Auth: me endpoint returns user with role
- [x] Admin: list all users, approve user, reject user
- [x] Admin: list all reservations, name time slots (session_name)
- [x] Reservations: create reservation (30-min intervals, $50/hr, $90/2hr)
- [x] Reservations: list user's own reservations
- [x] Reservations: cancel reservation
- [x] Reservations: check availability for a given date
- [x] Tournaments: create tournament (admin)
- [x] Tournaments: list tournaments
- [x] Tournaments: register for tournament (guest)
- [x] Tournaments: set winner (admin)
- [x] Notify admin when new user signs up

## Frontend — Theming & Layout
- [x] Custom color palette and fonts for sports facility
- [x] Public landing page with facility info and pricing
- [x] Navigation structure (public nav + dashboard sidebar for logged-in users)

## Frontend — Auth & Roles
- [x] Login/signup flow via Manus OAuth
- [x] Unapproved guest sees pending approval screen
- [x] Guest sees booking calendar and own reservations
- [x] Admin sees full admin dashboard

## Frontend — Booking
- [x] Calendar date picker for selecting reservation date
- [x] Time slot grid with 30-minute intervals
- [x] Duration selector (1hr/$50, 2hr/$90)
- [x] Contact info form (phone required, email optional)
- [x] Booking confirmation with confirmation number
- [x] My reservations list with cancel option

## Frontend — Admin Portal
- [x] User management: list users, approve/reject pending users
- [x] Reservation management: view all reservations, name time slots
- [x] Dashboard overview with stats

## Frontend — Tournaments
- [x] Tournament list page
- [x] Tournament registration for guests
- [x] Admin: create tournament form
- [x] Admin: set tournament winner
- [x] Tournament leaderboard / history

## Gap Fixes
- [x] Add tournament leaderboard UI showing winners across completed tournaments

## Tests
- [x] Auth role-based access tests (22 tests passing)
- [x] Reservation creation validation tests
- [x] Admin procedure authorization tests
- [x] Tournament procedure tests
- [x] Leaderboard public access test
- [x] Profile update validation test

## Bug Fixes & Changes (Round 2)
- [x] Remove login wall — let anyone access and book with just a phone number
- [x] Fix NaN date bug on reservations (especially March 29th) — shows NaN in admin and user can't see reservation

## Multi-Session Linked Reservations (Round 3)
- [x] Backend: update reservation.create to accept any duration that is a multiple of 30 minutes
- [x] Backend: proportional pricing ($25 per 30-min slot, with $90 cap for 2hr)
- [x] Frontend: drag-select UI on booking page — click and drag across consecutive available slots
- [x] Frontend: visual highlight of selected contiguous block during drag
- [x] Frontend: dynamic price calculation based on number of selected slots
- [x] Frontend: remove old fixed 1hr/2hr duration selector, replace with drag-based selection
- [x] Admin display: show multi-slot reservations properly with full time range
- [x] Dashboard display: show multi-slot reservations properly
- [x] Update tests for flexible duration validation

## UX Updates (Round 4- [x] Switch all time displays from 24-hour (military) to 12-hour AM/PM format
- [x] Use client browser timezone for all time displays
- [x] Add facility address (168 Broadhollow Road, Farmingdale, NY 11735) and phone (631-390-9661) to landing page
- [x] Add "Full Name" field (single field) to the booking form
- [x] Add notification opt-in checkbox to booking form (default: checked/yes)
- [x] Update backend reservation schema to store fullName and notifyBeforeReservation
- [x] Update Admin reservation display to show full name and notification preference
- [x] Update Dashboard reservation display to show full name

## UX Fixes (Round 5)
- [x] Make booked time slots more visually distinct (stronger color, strikethrough, or "Booked" label)
