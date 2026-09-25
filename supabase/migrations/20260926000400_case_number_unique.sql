-- Step 1 · 1F item #8: case numbers are minted client-side by scanning
-- in-memory state (src/lib/caseNumber.ts's generateCaseNumber), which is
-- correct for a single writer but lets two firm members creating cases in
-- the same instant compute the same "next" number.
--
-- This partial unique index turns that race into a rejected insert instead
-- of two cases silently sharing a number. src/repositories/cloud/index.ts's
-- CloudCaseRepository.create() catches the resulting 23505 and retries once
-- with a freshly regenerated number.
--
-- KNOWN GAP: this closes the common case (two members creating cases seconds
-- apart) but isn't a full distributed sequence — a third writer landing in
-- the same narrow retry window could still collide a second time (the retry
-- loop is bounded to 3 attempts, not unlimited). A real per-firm sequence
-- (e.g. a Postgres sequence or a `select ... for update` counter row) would
-- close this completely but is more machinery than this data scale needs.
--
-- Nullable case_number values (cases created before the case_number column
-- existed) are excluded via the WHERE clause so historical rows with no
-- number never collide with each other.

create unique index if not exists cases_firm_id_case_number_unique
  on cases (firm_id, case_number)
  where case_number is not null;
