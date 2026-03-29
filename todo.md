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
