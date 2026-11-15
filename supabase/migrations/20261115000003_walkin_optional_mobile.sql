-- Walk-in bookings paid in cash don't need a mobile number.
-- Online bookings, and walk-ins paid by GCash or Maya, still require one.

alter table public.bookings alter column mobile drop not null;

alter table public.bookings drop constraint bookings_mobile_check;
alter table public.bookings
  add constraint bookings_mobile_check check (mobile is null or mobile ~ '^(09|\+639)\d{9}$');

alter table public.bookings
  add constraint bookings_mobile_required check (
    mobile is not null or (source = 'walk_in' and payment_method = 'cash')
  );
