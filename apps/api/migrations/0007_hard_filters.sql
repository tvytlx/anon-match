-- Optional hard filters (private) + numeric age
ALTER TABLE profiles ADD COLUMN age INTEGER;
ALTER TABLE profiles ADD COLUMN want_age_min INTEGER;
ALTER TABLE profiles ADD COLUMN want_age_max INTEGER;
ALTER TABLE profiles ADD COLUMN want_same_city INTEGER;
ALTER TABLE profiles ADD COLUMN want_gender TEXT;
