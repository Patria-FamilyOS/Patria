# CIR05 step 2 — implementation plan

Follow `docs/security/KEYS.md` and D20–D25. **No code until Step 1 is approved.**

Every crypto file starts with `// SECURITY REVIEW REQUIRED`.

After **each** step: from `patria-app/`, run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npx supabase test db`, then one commit. Do not start the next step until those pass.

---

## Packages to pin (Step 1)

Ask before adding; these are the ones this plan needs. Install Expo packages with `npx expo install`.

| Package | Pin | Why | Audits |
|---|---|---|---|
| `@noble/ciphers` | **2.4.0** | XChaCha20-Poly1305 | Cure53, Sep 2024, v1.0.0: [PDF](https://cure53.de/audit-report_noble-crypto-libs.pdf). Changelog since: [1.0.0..2.4.0](https://github.com/paulmillr/noble-ciphers/compare/1.0.0...2.4.0). README also notes a self-audit at 2.2.0 (Apr 2026). |
| `@noble/curves` | **2.4.0** | X25519 | Cure53, Sep 2024, v1.6.0: same [PDF](https://cure53.de/audit-report_noble-crypto-libs.pdf). Trail of Bits, Aug 2026, v2.3.0 (see [npm/readme](https://www.npmjs.com/package/@noble/curves)). |
| `@noble/hashes` | **2.4.0** | HKDF-SHA256 | Cure53, Jan 2022, v1.0.0 (scope excludes blake3/sha1/argon2; we use SHA-256/HKDF only): [PDF](https://cure53.de/pentest-report_hashing-libs.pdf). [Changes since](https://github.com/paulmillr/noble-hashes/compare/1.0.0...2.4.0). |
| `shamir-secret-sharing` | **0.0.4** | 2-of-3 over `recovery_key`; pure TS, Expo Go | Cure53, Feb 2023: [PDF](https://cure53.de/audit-report_privy-sss-library.pdf). Zellic: [PDF](https://github.com/Zellic/publications/blob/master/Privy_Shamir_Secret_Sharing_-_Zellic_Audit_Report.pdf). Those reports cover earlier 0.0.x; 0.0.4 (Jan 2025) is the current pin. |
| `@scure/bip39` | **2.4.0** | 24-word encoding of the paper share (entropy only; we do not use BIP32 wallets) | Cure53, Jan 2022, as `micro-bip39` v1.0.0: [PDF](https://cure53.de/pentest-report_hashing-libs.pdf). Maintainer self-audit at 2.2.0 (Apr 2026): [compare to 2.4.0](https://github.com/paulmillr/scure-bip39/compare/2.2.0...2.4.0). |
| `expo-crypto` | **~15.0.8** via `npx expo install expo-crypto` (SDK 57 pin) | `getRandomValues` | Expo / OS CSPRNG. |
| `expo-secure-store` | already **~57.0.4** | Private keys; iOS `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; Android Keystore + `configureAndroidBackup` exclude | [Expo SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/). |

If `shamir-secret-sharing` fails Expo/Jest, Step 6 falls back to pairwise HKDF+AEAD as in KEYS.md (no hand-written Shamir).

---

## Step 1 — Crypto primitives and SecureStore (no database, no screens)

**Files**

* `patria-app/src/lib/crypto/random.ts` — `getRandomValues` via expo-crypto
* `patria-app/src/lib/crypto/hkdf.ts` — HKDF-SHA256
* `patria-app/src/lib/crypto/aead.ts` — XChaCha20-Poly1305 seal/open with AAD
* `patria-app/src/lib/crypto/x25519.ts` — device key pair; wrap 32-byte secret to a public key
* `patria-app/src/lib/crypto/secureKeys.ts` — `setItemAsync` / `getItemAsync` always with `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`
* `patria-app/src/lib/crypto/*.test.ts`
* `patria-app/app.json` (or expo plugin) — keep SecureStore Android backup exclude
* `package.json` / lockfile — pinned deps above

**Migrations:** none.

**Tests**

* Round-trip wrap/unwrap; wrong key fails; wrong AAD fails.
* HKDF is deterministic; different info/salt differs.
* `secureKeys` passes `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (mock SecureStore and assert options).
* No `Math.random`.

**Commit:** add audited noble primitives and backup-excluded key storage.

---

## Step 2 — Tables and RLS

**Files**

* `patria-app/supabase/migrations/YYYYMMDDHHMMSS_family_keys.sql` — tables in KEYS.md §2 (`device_keys`, `family_key_wraps`, `family_key_meta`, `recovery_key_wraps`, `family_key_under_recovery`, `device_approval_notices`, `recovery_contacts`, share/pair wraps, `recovery_contact_secrets`, `recovery_requests`)
* `patria-app/supabase/tests/database/cir_rls.test.sql` — extend `plan()`

**App:** none beyond types if needed.

**Tests (pgTAP)**

* Cross-family isolation.
* SELECT wraps only for `auth.uid()`.
* Insert wrap for another user: admins only, key-eligible roles, first device.
* Extra-device wrap insert: same `user_id` only.
* `recovery_key_wraps` only admin/co-admin.
* `recovery_requests` unusable before `not_before` / after cancel.
* No printed-code hash column (`hasnt_column` / comment check).
* Ciphertext columns are `bytea`.

**Commit:** add family key tables and policies so a broken Yes/No fails CI.

---

## Step 3 — Create family generates keys (4a)

**Files**

* `patria-app/src/lib/crypto/familyCeremony.ts` — create family_key, recovery_key, self-wraps, epoch-1 `family_key_under_recovery`
* Hook into `CreateFamilyScreen` after `create_family_space` succeeds (and lazy path helper for later)
* `copy.ts` only if we show a quiet “keys ready” line (optional; can wait)

**Migrations:** none if Step 2 landed.

**Tests**

* Jest: ceremony produces wraps; server payload has no 32-byte plaintext family key.
* After create, creator can unwrap; `recovery_key_wraps` exists for creator.

**Commit:** generate family and recovery keys on the founding phone.

---

## Step 4 — First device: admin “Let them in” (4b)

**Files**

* `patria-app/src/features/keys/LetInScreen.tsx` (+ route)
* `patria-app/src/features/keys/WaitingForKeyScreen.tsx`
* Notices query + admin wrap insert
* `copy.ts`

**Migrations:** none.

**Tests**

* Jest: Let in UI shows name + device created-at; decline does not wrap.
* Helper refuses auto-wrap when a public key appears.
* pgTAP already covers insert policy; add Jest that wrap is only called from the approve handler.

**Commit:** admins explicitly wrap the family key to a member’s first phone.

---

## Step 5 — Extra device: self-approve only (4c)

**Files**

* `patria-app/src/features/keys/ApproveMyDeviceScreen.tsx`
* Notices to member’s other devices **and** admins (admins cannot wrap)

**Tests**

* Jest: extra-device wrap helper throws if caller `user_id` ≠ device owner.
* Notices exist for admins but approve action is hidden / disabled for them.

**Commit:** extra phones get keys only from the member’s existing phone.

---

## Step 6 — Recovery contacts, Shamir, printed code, 48-hour wait (4d)

**Files**

* `patria-app/src/lib/crypto/recovery.ts` — split `recovery_key` 2-of-3; pairwise fallback
* `patria-app/src/lib/crypto/recoveryWait.ts` — `recoveryWaitMs()`: **48 hours** (`48 * 60 * 60 * 1000`) unless `__DEV__` (2 minutes). No production env var may shorten this. Store builds always take the 48-hour path.
* `patria-app/src/lib/crypto/recoveryWait.test.ts` — **`process.env.NODE_ENV === 'production'` / `__DEV__ === false` ⇒ 48 hours** (force that in one test)
* Screens: add two contacts, show 24-word code once, start recovery, This wasn’t me, contact approve copy (“confirm by phone or in person”)
* `copy.ts`

**Migrations:** none if Step 2 has `recovery_requests.not_before`.

**Tests**

* Any 2 of 3 recover `recovery_key`; 1 of 3 does not.
* Then current-epoch family key opens; after a mocked family-key rotation, **same** shares still open new epoch via `family_key_under_recovery`.
* Printed code never sent to a hash/insert helper.
* Client refuses complete before `not_before`.
* **Production wait is 48 hours** (dedicated Jest).

**Commit:** add 2-of-3 recovery of the long-lived recovery key with a 48-hour wait.

---

## Step 7 — Remove member: rotate family key, keep recovery_key (4e)

**Files**

* `patria-app/src/lib/crypto/rotateFamilyKey.ts`
* Hook after successful member remove / recovery-contact remove
* If contact removed or paper reported lost: `rotateRecoveryKey.ts` + new printed-code prompt

**Tests**

* Jest: remaining devices unwrap new epoch; removed user has no wrap; recovery boxes still open new `family_key_under_recovery`.
* Contact removal rotates recovery_key and invalidates old paper (new ceremony).
* pgTAP: removed member cannot SELECT new wraps.

**Commit:** rotate the family key on remove without invalidating the printed code.

---

## Step 8 — Existing families, vault gate, copy polish (4g, D25)

**Files**

* Lazy ceremony when an admin opens a space with no `family_key_meta`
* Vault placeholder / future vault entry checks two recovery contacts
* Remaining `copy.ts` strings
* `docs/BUILD_LOG.md` entry

**Tests**

* Jest: lazy create once; members still need Let in.
* Vault blocked without two contacts; Home is not.

**Commit:** give slice 1 families keys on next admin open; require contacts before vault.

---

## After all steps

* List CIR05 key acceptance criteria met vs not (Story/SMS still out).
* Human security review of every `SECURITY REVIEW REQUIRED` file and of libsodium-before-beta.
* Optional safety-number UI only if that review asks.

---

*Waiting for approval of **Step 1** before any code.*
