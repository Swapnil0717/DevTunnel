/**
 * How many rows each Home list renders, in one place — the real lists and
 * their loading skeletons both read these, so a skeleton can't show a
 * different number of rows than the list that replaces it.
 */

/** "Your tasks": the first few of everything the contributor has claimed (`MyTasksList`). */
export const HOME_MY_TASKS_LIMIT = 5;

/**
 * "Recommended tasks": the backend already caps `GET /users/me/recommended-tasks`
 * at this many (`RECOMMENDED_TASKS_LIMIT` in devtunnel-backend/src/routes/tasks.ts).
 * Keep the two in step — this one only sizes the skeleton.
 */
export const HOME_RECOMMENDED_TASKS_LIMIT = 5;

/** "Recently active": passed to `GET /users/me/activity?limit=` (`getRecentActivity`). */
export const HOME_RECENT_ACTIVITY_LIMIT = 5;
