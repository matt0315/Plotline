-- Anonymous usage counts: which features get used, per day. No accounts, events, guests or IPs.
CREATE TABLE usage_daily (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event)
);
-- Active browsers per day: a random id from the browser, hashed with the day so it can't be followed across days.
CREATE TABLE usage_devices (
  day TEXT NOT NULL,
  device TEXT NOT NULL,
  PRIMARY KEY (day, device)
);
