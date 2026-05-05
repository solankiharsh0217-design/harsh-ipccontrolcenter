Here is what is happening and how I will fix it.

Why you are not seeing the button / records

1. The backend database already has student records loaded.
   - I checked it directly: there are 5,215 records currently loaded.
   - The name in your screenshot, “Himashri Bora”, is present in the backend.
   - So the Google Sheet import itself is not the missing piece right now.

2. The current Student Search page is relying on frontend role detection to show the “Sync from sheets” button.
   - The button is currently shown only when the page detects the logged-in user as admin.
   - In your screenshot, the left bottom user box is showing “U” and “—” instead of your admin profile name/role, which means the page is not correctly loading your profile/role in the frontend session.
   - Because of that, the app hides the sync button even though your admin account exists in the backend.

3. The count showing “0 members” means the browser query is not seeing the student rows, even though the backend has them.
   - This is most likely caused by frontend session/profile/role loading not being ready or not matching the backend access rules at the time the page queries students.
   - The result is: no button, count 0, and searches return “No student found.”

What I will change

1. Make Student Search work through a backend search function instead of relying only on direct browser database queries.
   - The page will call a secure backend function to search students.
   - The backend function will verify the logged-in user is an active team member/admin, then search the full student database.
   - This avoids the current frontend access/role timing issue that is making the page see 0 records.

2. Show the “Sync from sheets” button to all active logged-in team members on the Student Search page.
   - Not admin-only anymore.
   - If a user can access Student Search, they will see the sync button.
   - The backend will still require the user to be logged in and active.

3. Automatically sync from the sheets when needed.
   - On Student Search page load, the app will check the real backend student count.
   - If the count is 0 or the search backend reports no imported records, it will automatically run the sheet sync.
   - The user will not need to hunt for an admin-only button just to make data appear.

4. Keep the manual sync button for refreshes.
   - The button will remain visible in Student Search.
   - Text will be clear, for example: “Refresh student database”.
   - After sync, the count will update immediately.

5. Fix the auth/profile loading behavior.
   - I will update the app’s auth context so it waits properly for profile and role loading.
   - The sidebar should show the real user name and role instead of “U / —”.
   - Admin-only UI should no longer disappear because role loading is late.

6. Improve the search behavior.
   - Search by name, email, or phone.
   - Trim spaces and handle case-insensitive search.
   - Show a clear loading state while searching.
   - Show the current imported record count from the backend.

Technical changes

- Add or update a secure backend function for student search and count.
- Update the existing sheet import backend function so active team members can trigger it, not only admins.
- Update `StudentSearch.tsx` to:
  - use the backend search/count function,
  - show the sync button for active logged-in users,
  - auto-sync if the backend count is empty,
  - refresh count/results after sync.
- Update `AuthContext.tsx` to separate session loading from profile/role loading and prevent UI from rendering with incomplete role/profile state.
- Keep the student table protected; the browser will not get broad public access to the full contact database.

After approval, I’ll implement this and then verify that “Himashri Bora” returns from Student Search and that the sync button appears on the page.