# Patria phone tests (source for Maestro automation)

Master copy for people: the Patria Test and Demo Script (Claude Doc). Keep both in step; this file is the one Cursor reads.

Copied from the Patria Test and Demo Script on Oct 13, 2026. When a test changes, both are updated.

Each step says what counts as a pass. Steps marked **(manual)** need a person's judgement and stay manual. Each test lists `Areas:` (auth, navigation, invites, children, keys, devices, recovery, rotation, membership) so `npm run e2e:affected` can run only the tests that match changed files.

## Accounts

| Account | Email | Role in the tests |
| --- | --- | --- |
| Test 1 | femipaul7535+test1@gmail.com | Creates the family; Family admin |
| Test 2 | femipaul7535+test2@gmail.com | Invited; Elder (Co admin in test 10) |
| Test 3 | femipaul7535+test3@gmail.com | Cancelled invite in slice 1; Elder or Teen in key tests |

Passwords are never written in this file. Invites must go to these exact addresses, because Patria checks that an invite is accepted by the email it was sent to.

## Slice 1 (CIR05, CIR01, CIR02)

### 1. Back navigation
Areas: navigation, auth
1. Sign in as Test 1. You land on Home.
2. Tap **Invite someone**. Pass if a back arrow shows at the top left.
3. Tap the arrow. Pass if you return to Home.
4. Open **Invite someone** again and swipe right from the left edge. Pass if you return to Home.
5. Repeat with **Add a child**. Pass if Home itself has no back arrow.

### 2. Pull to refresh
Areas: navigation
1. On Home, drag down from near the top and let go.
2. Pass if a spinner shows briefly, the screen reloads, and there is no **Continue** button.

### 3. Invite and accept
Areas: invites, auth, membership
1. As Test 1, tap **Invite someone**, enter Test 2's email, choose **Elder**, and send.
2. In the share sheet, tap **Copy**. (manual)
3. Sign out, then sign in as Test 2. A new person with no family lands on **Create family**.
4. Use **Were you invited to a family? Paste your invite link**: paste, then **Open**.
5. Pass if you see the family name, your role, and what others can see about you, before accepting.
6. Tap **Accept**. Pass if you land on Home and see the family and its members.

### 4. Cancelled invite
Areas: invites, auth
1. Sign out, sign in as Test 1, invite Test 3's email, and tap **Copy**. (manual)
2. Find the pending invite and tap **Revoke**.
3. Sign out, sign in as Test 3, and paste the link.
4. Pass if you see a friendly "no longer valid" message with no technical error text.
5. Sign out and back in as Test 3. Pass if the old invite does not reappear.

### 5. Sign out
Areas: auth
1. On Home, tap **Sign out**. Pass if a spinner shows, then the Welcome screen.
2. Swipe right from the left edge. Pass if you stay on Welcome.

### 6. Add a child
Areas: children, membership
1. As Test 1, tap **Add a child**, enter **Lily**, and save.
2. Pass if Lily appears in the member list as a child with no email.
3. Sign out, sign in as Test 2. Pass if there is no **Add a child** option and no email addresses are shown (D17).

### 7. Large text (manual)
Areas: navigation
1. Settings, Accessibility, Display & Text Size, Larger Text: turn on Larger Accessibility Sizes and drag the slider most of the way right.
2. Open Welcome, Home, Invite someone and Add a child.
3. Pass if all text is readable, no button is cut off, and everything can be reached by scrolling. For now (D19) text stops growing at a moderate size.
Automation may capture screenshots at large text for a person to review, but a person decides pass or fail.

## Family keys (CIR05 part B)

### 8. Family key created on this phone (Step 3)
Areas: keys
1. Sign in as Test 1 and create a new family, for example **Test Keys Family**. If you already have a space, tap **Create another family** on Home.
2. Pass if Home shows that family keys are set up on this phone.
3. Database: one row in `family_key_meta` for the new family with key epoch 1.
4. Database: exactly one row in `family_key_wraps` for that family, and the wrapped key column is unreadable bytes.
5. Open an older family Test 1 is an admin of. Pass if keys are set up automatically, with no extra screens.
6. Sign in as Test 2 (not an admin) in a family Test 2 belongs to. Pass if no new key is created and Home calmly says this phone is waiting for a family admin.
7. Fully close and reopen the app as Test 1. Pass if keys still show as set up, with no new rows in `family_key_meta`.

### 9. Let a new member's phone in (Step 4)
Areas: keys, devices, membership, invites
One device is enough: each account on the same device counts as its own device. With two devices, keep Test 1 on device A and Test 2 on device B and skip the sign outs.
1. As Test 1 in the family with keys, invite Test 2 as **Elder** if not already a member.
2. As Test 2, accept the invite if needed. Pass if Home says this phone is waiting for a family admin.
3. As Test 1. Pass if a notice shows that Test 2 wants this phone let in, with name, role and when the phone was set up.
4. Tap **Let in**. Pass if the notice disappears and a new row for Test 2 appears in `family_key_wraps`.
5. As Test 2. Pass if Home now says family keys are set up on this phone.
6. Repeat with Test 3 invited as **Extended relative**. Pass if no notice ever appears for Test 3.
7. Invite Test 3 to a different test family as **Elder**, have them accept, then as Test 1 tap **Decline**. Pass if Test 3 keeps waiting and no wrap row is created.

### 10. Approve your own new phone (Step 5)
Areas: devices, keys
Needs a second device for the same account (device B). Device A is where Test 1 already has keys.
1. Sign in as Test 1 on device B. Pass if B says it is waiting for one of your existing phones.
2. On device A as Test 1. Pass if a notice asks "Is this your new phone?" with when B was set up.
3. Make Test 2 a Co admin, sign in as Test 2. Pass if they see an information notice about Test 1's new phone with no button to let it in.
4. On device A tap **Yes, this is my phone**. Pass if B now says family keys are set up and a new row for Test 1 and device B appears in `family_key_wraps`.
5. Sign in as Test 1 on a fresh device (or B after clearing app data), then on device A tap **This wasn't me**. Pass if that device never gets keys and admins are told.
6. On device A, from Home, scroll past invite, add a child, and Recovery contacts, then open **Your phones**. Remove device B and confirm **Remove**. Pass if B goes back to waiting and its row disappears from `family_key_wraps`.

### 11. Set up recovery contacts and printed code (Step 6)
Areas: recovery, keys
Device A: Test 1 (Family admin). Device B: Test 2, Elder or Co admin, already let in. After D27 (Oct 13), run this fresh for each account before test 12.
1. On A as Test 1, open the family. Pass if Home shows a calm **Set up recovery** card that blocks nothing else.
2. Tap it and choose Test 2 as the first contact. Pass if only adult family members whose phones are let in can be chosen.
3. On B as Test 2, pull to refresh. Pass if a notice explains what being a recovery contact means, with **Accept** and **Decline**. Tap **Accept**.
4. Back on A, add a second contact the same way (make Test 3 an Elder, let them in, have them accept). Pass if the card says recovery is set up with two contacts.
5. On A, after two contacts have accepted, Home (and Recovery contacts) shows **Write down a printed code**. Tap it. Pass if 24 words appear once with a clear "write this down" warning, and the app asks you to type a few back before finishing. (Automation: read the words from the screen and keep them in memory for test 12; never write them to a file or log.)
6. Database: locked boxes, contact rows, one row per member in `recovery_public_keys` (a public key only), no `recovery_key_wraps` table, and nothing that looks like the 24 words or a readable key.
7. Remove Test 3 as a contact. Pass if that member sees **Recovery needs attention** and is asked to choose a new contact. Remaining contact and paper stay valid until they redo (D27). Redo offers a new printed code; the old code then no longer works.

### 12. Recover after losing every phone (Step 7)
Areas: recovery, devices
Before: test 11 passed for Test 2 (contacts Test 1 and Test 3, printed code known). Recovery wait shortened for testing only. Devices: device 1 = Test 1 (contact A, admin); device 2 = Test 2's old phone; new device = Test 2's new device.
1. On the new device sign in as Test 2. Pass if "Waiting for approval" shows with **I lost my phone**. Tap it and confirm. (manual, pending automation: Test 2 cannot pick Test 1 as a recovery contact in seed, so the new phone never starts Test 2’s recovery)
2. Pass if the new device shows a countdown and says contacts were asked to call first, and devices 1 and 2 both show a recovery alert, with **This wasn't me** on device 2. (manual, pending automation: depends on step 1)
3. Cancel check: on device 2 tap **This wasn't me**. Pass if the new device shows the request was cancelled. Start a new request. (manual, pending automation: depends on step 1)
4. Admin stop check: on device 1 tap **Stop this recovery**. Pass if the new device shows it was cancelled by a family admin. Starting a new request also cancels any older open one. Start a fresh request. (manual, pending automation: depends on step 1)
5. Too early check: on device 1 open the request right away. Pass if Approve is locked and shows when it unlocks.
6. After the wait, on device 1 tap **Approve** after the reminder to confirm by phone. (manual, pending automation: depends on step 1)
7. On the new device tap **Use my printed code** and type the 24 words. Pass if a wrong word gives a friendly error, not a crash. (manual, pending automation: clipboard is on the old phone; paper is not saved unless the confirm step runs)
8. Pass if the new device says the family key is restored, then shows **Remove your old phones** with device 2 ticked. Tap to confirm. Pass if device 2 becomes removed and device 1 gets a notice. Old phones must never be removed before the tap. (manual, pending automation: Maestro relaunches onto Home, so Remove your old phones is gone)
9. One helper is not enough: fresh request, only device 1 approves, no code typed. Pass if the new device keeps waiting.
10. Optional: recover with contact A and contact B, no code. (manual)
Pass when steps 2 to 8 behave as written, no screen shows the code words after typing, and no database column holds the printed code.

### 13. A new family key when someone leaves (Step 8)
Areas: rotation, membership, keys
Before: Test 1 (admin) and Test 2 (Elder) have let in devices; Test 3 joined as Teen or Elder with a let in device. Note the highest key epoch for the family.
1. On device 1 (Test 1) remove Test 3. Confirm the native alert **Remove from this family**. Pass if Home briefly shows **Updating the family key**, then **The family key is up to date**.
2. Database: key epoch up by one; new wraps only for Test 1's and Test 2's let in devices; none for Test 3 at any epoch.
3. On Test 2's device pull to refresh. Pass if keys are still set up with no approval needed.
4. As Test 3, bring the app to the foreground (or pull to refresh). Pass if they no longer see the family and no new wrap exists for them; they should not need to sign out.
5. If Test 3 was a recovery contact, pass if that member sees **Recovery needs attention** and is asked to choose a new contact.
6. Database: `family_key_under_recovery` has one new row at the new epoch per remaining member with recovery set up, none for Test 3.
7. Invite Test 3 back, let them in, then as Test 3 open your own member row and tap **Leave family**. Confirm on the destructive **Leave family** button. Pass if the next time Test 1 opens the app the key is updated on its own (epoch up again).
8. Change Test 2 from Elder to Extended relative. Pass if the key is updated and Test 2 no longer holds it. Change back and let Test 2 in again.
9. Add and remove a Caregiver. Pass if the key epoch does not change.
10. Optional: two admins remove someone at the same moment. Pass if only one new key version appears and both end up on it. (manual)
Pass when steps 1 to 9 behave as written and no screen or log shows a key.
