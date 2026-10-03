-- DevTunnel — remove the sponsor page's database objects.
--
-- The /sponsors page, the Razorpay webhook and the admin Sponsors module are
-- gone: "Sponsor us" is now a plain link to an external Razorpay page, and
-- DevTunnel stores nothing about it.
--
-- Run once, ONLY if you had applied 048_sponsorships.sql and
-- 049_sponsor_goal_summary.sql. Safe to run if you hadn't (every statement is
-- `if exists`). This permanently deletes any sponsor rows and monthly goals.
-- Take a backup first if you want to keep them.
--
-- Also remove the `RAZORPAY_WEBHOOK_SECRET` secret if you set it:
--   npx wrangler secret delete RAZORPAY_WEBHOOK_SECRET
-- and delete the webhook in the Razorpay dashboard.

drop function if exists devtunnel.sponsor_goal_summary(date);
drop function if exists devtunnel.sponsor_month_total(date);
drop table if exists devtunnel.sponsor_goals;
drop table if exists devtunnel.sponsorships;